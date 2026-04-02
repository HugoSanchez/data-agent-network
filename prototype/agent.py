"""
Minimal P2P LLM Agent using libp2p

Two agents can discover each other on the local network via mDNS,
send messages, and respond using an LLM.

Usage:
    # Terminal 1 - Start first agent
    python agent.py --name "Agent-A" --port 8000

    # Terminal 2 - Start second agent
    python agent.py --name "Agent-B" --port 8001

They will automatically discover each other via mDNS.
"""

# Load environment variables from .env file
from dotenv import load_dotenv
load_dotenv()

import argparse
import json
import logging
import sys
from typing import Callable

import trio

from libp2p import new_host
from libp2p.custom_types import TProtocol
from libp2p.network.stream.net_stream import INetStream
from libp2p.peer.peerinfo import PeerInfo

# Suppress noisy logs (including harmless Noise handshake race conditions)
logging.basicConfig(level=logging.CRITICAL)
logging.getLogger("libp2p").setLevel(logging.CRITICAL)
logging.getLogger("multiaddr").setLevel(logging.CRITICAL)

# Our custom protocol for agent-to-agent communication
AGENT_PROTOCOL = TProtocol("/agent/1.0.0")


class LLMAgent:
    """A simple P2P agent that can send/receive messages and respond via LLM."""

    def __init__(self, name: str, port: int, llm_handler: Callable[[str], str] = None,
                 auto_mode: bool = False, max_rounds: int = 5):
        self.name = name
        self.port = port
        self.host = None
        self.discovered_peers = {}  # peer_id_str -> peer_id
        self._nursery = None  # Reference to cancel on quit

        # Auto-conversation mode
        self.auto_mode = auto_mode
        self.max_rounds = max_rounds
        self.conversation_count = {}  # peer_id_str -> number of exchanges

        # LLM handler - defaults to echo if not provided
        self.llm_handler = llm_handler or self._default_handler

    def _default_handler(self, message: str) -> str:
        """Default handler - just echoes back. Replace with real LLM."""
        return f"[{self.name}] received: {message}"

    async def _handle_incoming_stream(self, stream: INetStream) -> None:
        """Handle incoming messages from other agents."""
        try:
            # Read the incoming message
            data = await stream.read(4096)
            if not data:
                return

            message = json.loads(data.decode())
            sender = message.get('from', 'unknown')
            content = message.get('content', '')
            print(f"\n<< [{sender}]: {content}")

            # Process with LLM and respond
            response_content = self.llm_handler(content)

            response = json.dumps({
                "from": self.name,
                "type": "response",
                "content": response_content
            })

            await stream.write(response.encode())
            await stream.close()

            print(f">> [{self.name}]: {response_content}")
            if not self.auto_mode:
                print("> ", end="", flush=True)

        except Exception as e:
            print(f"Error handling stream: {e}")

    async def _poll_for_peers(self) -> None:
        """Periodically check for new peers discovered via mDNS."""
        my_id = self.host.get_id()

        while True:
            await trio.sleep(2)  # Check every 2 seconds

            # Get peers that have known addresses (discovered via mDNS)
            peerstore = self.host.get_peerstore()
            for peer_id in peerstore.peers_with_addrs():
                if peer_id == my_id:
                    continue

                peer_id_str = peer_id.to_string()
                if peer_id_str not in self.discovered_peers:
                    # Connect immediately on discovery
                    addrs = peerstore.addrs(peer_id)
                    try:
                        peer_info = PeerInfo(peer_id, addrs)
                        await self.host.connect(peer_info)
                        self.discovered_peers[peer_id_str] = peer_id
                        short_id = peer_id_str[7:19]
                        print(f"\n[Connected] Peer: {short_id}...")
                        if not self.auto_mode:
                            print("> ", end="", flush=True)

                        # In auto mode, start a conversation
                        if self.auto_mode and self._nursery:
                            self._nursery.start_soon(self._auto_converse, peer_id_str)
                    except Exception:
                        pass  # Silently skip failed connections

    async def _auto_converse(self, peer_id_str: str) -> None:
        """Have an autonomous conversation with a peer."""
        # Small delay to let both sides connect
        await trio.sleep(1)

        # Only one side should initiate (use lexicographic ordering of peer IDs)
        my_id_str = self.host.get_id().to_string()
        if my_id_str > peer_id_str:
            return  # Let the other peer initiate

        self.conversation_count[peer_id_str] = 0

        # Generate opening message
        opener = self.llm_handler(
            "You just connected to a new AI agent on the P2P network. "
            "Say hello and ask them something interesting about themselves or what they can do. "
            "Keep it to 1-2 sentences."
        )

        print(f"\n>> [{self.name}]: {opener}")

        for round_num in range(self.max_rounds):
            # Send message and get response
            response = await self.send_message("1", opener if round_num == 0 else follow_up)

            if "Error" in response or "not found" in response.lower():
                print(f"[Conversation ended: {response}]")
                break

            print(f"<< [Peer]: {response}")
            self.conversation_count[peer_id_str] = round_num + 1

            if round_num < self.max_rounds - 1:
                # Generate follow-up
                await trio.sleep(2)  # Pause between messages
                follow_up = self.llm_handler(
                    f"The other agent said: '{response}'. "
                    f"Continue the conversation naturally. Ask a follow-up question or share something relevant. "
                    f"Keep it to 1-2 sentences."
                )
                print(f">> [{self.name}]: {follow_up}")

        print(f"\n[Conversation complete - {self.max_rounds} exchanges]")
        if not self.auto_mode:
            print("> ", end="", flush=True)

    async def send_message(self, peer_hint: str, content: str) -> str:
        """Send a message to a discovered peer and get response."""
        # Find matching peer from our discovered peers cache
        target_peer_id = None
        matched_pid_str = None

        peer_list = list(self.discovered_peers.items())

        # Check if peer_hint is a number (index)
        if peer_hint.isdigit():
            idx = int(peer_hint) - 1  # 1-indexed for user
            if 0 <= idx < len(peer_list):
                matched_pid_str, target_peer_id = peer_list[idx]
        else:
            # Try to match by substring (anywhere in the ID)
            for pid_str, pid in peer_list:
                if peer_hint in pid_str:
                    target_peer_id = pid
                    matched_pid_str = pid_str
                    break

        if not target_peer_id:
            return f"Peer not found. Use 'list' to see discovered peers."

        try:
            # Open a stream (already connected during discovery)
            stream = await self.host.new_stream(target_peer_id, [AGENT_PROTOCOL])

            # Send message
            message = json.dumps({
                "from": self.name,
                "type": "request",
                "content": content
            })
            await stream.write(message.encode())

            # Read response
            response_data = await stream.read(4096)
            await stream.close()

            if response_data:
                response = json.loads(response_data.decode())
                return response.get('content', '')

            return "No response received"

        except Exception as e:
            return f"Error sending message: {e}"

    async def run(self) -> None:
        """Start the agent and run the interactive loop."""
        from libp2p.utils.address_validation import (
            find_free_port,
            get_available_interfaces,
        )

        # Use specified port or find free one
        port = self.port if self.port > 0 else find_free_port()
        listen_addrs = get_available_interfaces(port)

        # Create host with mDNS enabled
        self.host = new_host(enable_mDNS=True)

        async with self.host.run(listen_addrs=listen_addrs):
            # Set up our protocol handler
            self.host.set_stream_handler(AGENT_PROTOCOL, self._handle_incoming_stream)

            print(f"\n{'='*60}")
            print(f"  Agent '{self.name}' started!")
            print(f"{'='*60}")
            print(f"  Peer ID: {self.host.get_id().to_string()}")
            print(f"  Listening on:")
            for addr in self.host.get_addrs():
                print(f"    {addr}")
            print(f"\n  Discovering peers via mDNS...")
            if self.auto_mode:
                print(f"  Auto-conversation: {self.max_rounds} rounds")
            print(f"{'='*60}")
            if not self.auto_mode:
                print(f"\nCommands:")
                print(f"  list              - Show discovered peers")
                print(f"  send <peer> <msg> - Send message to peer")
                print(f"  quit              - Exit")
                print()

            # Run tasks concurrently
            async with trio.open_nursery() as nursery:
                self._nursery = nursery
                nursery.start_soon(self._poll_for_peers)
                nursery.start_soon(self._command_loop)
                nursery.start_soon(self.host.get_peerstore().start_cleanup_task, 60)

    async def _command_loop(self) -> None:
        """Simple interactive command loop."""
        async_stdin = trio.wrap_file(sys.stdin)

        while True:
            try:
                print("> ", end="", flush=True)
                line = await async_stdin.readline()
                if not line:
                    continue

                parts = line.strip().split(maxsplit=2)
                if not parts:
                    continue

                cmd = parts[0].lower()

                if cmd == "quit" or cmd == "exit":
                    print("Goodbye!")
                    if self._nursery:
                        self._nursery.cancel_scope.cancel()
                    return

                elif cmd == "list":
                    if self.discovered_peers:
                        print("\nDiscovered peers:")
                        for i, pid_str in enumerate(self.discovered_peers.keys(), 1):
                            # Show the unique part (after "12D3Koo")
                            short_id = pid_str[7:19] if len(pid_str) > 19 else pid_str
                            print(f"  [{i}] {short_id}...")
                    else:
                        print("\nNo peers discovered yet. Make sure another agent is running on the same network.")

                elif cmd == "send" and len(parts) >= 3:
                    peer_hint = parts[1]
                    message = parts[2]
                    print(f"Sending...")
                    response = await self.send_message(peer_hint, message)
                    print(f"Response: {response}")

                elif cmd == "send":
                    print("Usage: send <number> <message>  (use 'list' to see peer numbers)")

                else:
                    print("Unknown command. Try: list, send <peer> <message>, quit")

            except Exception as e:
                print(f"Error: {e}")


# =============================================================================
# LLM Integration
# =============================================================================

def create_llm_handler(agent_name: str, model: str) -> Callable[[str], str]:
    """
    Creates an LLM handler using LiteLLM (supports Claude, GPT, Ollama, etc.)

    Examples:
        model="claude-sonnet-4-20250514"  # Anthropic (needs ANTHROPIC_API_KEY)
        model="gpt-4o"                    # OpenAI (needs OPENAI_API_KEY)
        model="ollama/qwen3:7b"           # Local via Ollama (free)
    """
    from litellm import completion

    system_prompt = f"""You are {agent_name}, an AI agent running on a decentralized P2P network.
You can communicate with other AI agents on the network.
Keep responses concise (1-2 sentences) since this is a chat between agents.
Be friendly and curious about other agents you meet."""

    def handler(message: str) -> str:
        try:
            response = completion(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": message}
                ],
                max_tokens=256
            )
            return response.choices[0].message.content
        except Exception as e:
            return f"[{agent_name}] Error calling LLM: {e}"

    return handler


def create_mock_handler(agent_name: str) -> Callable[[str], str]:
    """Fallback mock handler for testing without LLM."""
    def handler(message: str) -> str:
        return f"[{agent_name}] Mock response to: '{message}'"
    return handler


# =============================================================================
# Main
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="P2P LLM Agent")
    parser.add_argument("--name", "-n", default="Agent", help="Name of this agent")
    parser.add_argument("--port", "-p", type=int, default=0, help="Port to listen on (0 = auto)")
    parser.add_argument("--model", "-m", default="claude-sonnet-4-20250514",
                        help="LLM model to use (e.g., claude-sonnet-4-20250514, gpt-4o, ollama/qwen3:7b)")
    parser.add_argument("--mock", action="store_true", help="Use mock LLM (no API calls)")
    parser.add_argument("--auto", action="store_true", help="Auto-conversation mode")
    parser.add_argument("--rounds", type=int, default=5, help="Number of conversation rounds in auto mode")
    args = parser.parse_args()

    # Create LLM handler
    if args.mock:
        llm_handler = create_mock_handler(args.name)
        print(f"Using mock LLM handler")
    else:
        llm_handler = create_llm_handler(args.name, args.model)
        print(f"Using model: {args.model}")

    if args.auto:
        print(f"Auto-conversation mode: {args.rounds} rounds")

    agent = LLMAgent(name=args.name, port=args.port, llm_handler=llm_handler,
                     auto_mode=args.auto, max_rounds=args.rounds)

    try:
        trio.run(agent.run)
    except KeyboardInterrupt:
        pass  # Clean exit on Ctrl+C
    finally:
        print("\nShutting down...")


if __name__ == "__main__":
    main()
