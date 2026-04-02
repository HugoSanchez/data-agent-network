# P2P LLM Agent Prototype

A minimal prototype demonstrating two LLM agents discovering each other via libp2p and mDNS, then exchanging messages.

## What This Does

1. Each agent starts a libp2p node
2. Agents discover each other automatically via mDNS (no hardcoded addresses)
3. Agents can send messages to each other
4. Messages are processed by an LLM (mock by default, can be replaced)

## Setup

```bash
cd prototype

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

## Running Two Agents

Open **two terminal windows**.

**Terminal 1:**
```bash
source venv/bin/activate
python agent.py --name "Alice" --port 8000
```

**Terminal 2:**
```bash
source venv/bin/activate
python agent.py --name "Bob" --port 8001
```

Within a few seconds, you should see each agent discover the other via mDNS.

## Sending Messages

Once agents discover each other, you can send messages:

```
# In Alice's terminal:
list                           # See discovered peers
send 12D3K hello               # Send "hello" to Bob (use first chars of peer ID)

# Bob will receive the message, process it, and respond
```

## Adding a Real LLM

Edit `agent.py` and replace the `create_mock_llm_handler` function:

```python
import anthropic

def create_real_llm_handler(agent_name: str):
    client = anthropic.Anthropic()  # Uses ANTHROPIC_API_KEY env var

    def handler(message: str) -> str:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            system=f"You are {agent_name}, an AI agent in a P2P network. Be helpful and concise.",
            messages=[{"role": "user", "content": message}]
        )
        return response.content[0].text

    return handler
```

Then update the `main()` function to use `create_real_llm_handler`.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Agent                                │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐      ┌────────────────────────────┐   │
│  │   LLM Handler   │      │       libp2p Host          │   │
│  │  (process msgs) │◄────►│  - mDNS discovery          │   │
│  └─────────────────┘      │  - Stream handler          │   │
│                           │  - Peer connections        │   │
│                           └────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
           │                            │
           │ LLM API                    │ P2P Network
           ▼                            ▼
    ┌─────────────┐            ┌─────────────────┐
    │   Claude    │            │  Other Agents   │
    │   GPT, etc  │            │  on local net   │
    └─────────────┘            └─────────────────┘
```

## Next Steps

Once this works locally, the progression would be:

1. **Add DHT discovery** - find peers across the internet, not just local network
2. **Add capability advertisement** - agents announce what they can do
3. **Add data provider logic** - agents that serve data and compute
4. **Add payment integration** - agents pay for compute

## Troubleshooting

**mDNS not discovering peers?**
- Make sure both agents are on the same local network
- Some networks block mDNS (port 5353 UDP multicast)
- Try running on different ports

**Connection errors?**
- Check firewall settings
- Try disabling VPN if active
