# 🏠 TLC Lead Capture Voice Agent

AI-powered voice agent for manufactured home financing lead capture using **Twilio ConversationRelay** and **OpenAI**.

```
┌─────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│   Caller    │────▶│  Twilio              │────▶│   Your Server   │
│   📞        │     │  ConversationRelay   │     │   (WebSocket)   │
└─────────────┘     └──────────────────────┘     └────────┬────────┘
                                                          │
                           ┌──────────────────────────────┼──────────────────────────────┐
                           │                              │                              │
                           ▼                              ▼                              ▼
                    ┌─────────────┐              ┌─────────────┐              ┌─────────────┐
                    │   OpenAI    │              │   State     │              │   Hestia    │
                    │   GPT-4o    │              │   Machine   │              │   API       │
                    └─────────────┘              └─────────────┘              └─────────────┘
```

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🎯 **Guided Conversation** | State machine drives callers through prequalification flow |
| 🔧 **Function Calling** | Structured data extraction via OpenAI tools |
| 📊 **Lead Management** | Hestia API integration for routing and delivery |
| 🏪 **Dealer Attribution** | Automatic tracking number detection |
| ⚡ **Low Latency** | Token streaming with TTFT tracking |
| 📈 **Metrics** | Prequalification rates, drop-off analysis |

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your OPENAI_API_KEY and NGROK_URL

# Start ngrok (separate terminal)
ngrok http 8080

# Run lead capture server
npm run start:lead-capture
```

## 📁 Project Structure

```
hestia-voice/
├── server-lead-capture.js    # 🎯 Lead capture server (main)
├── server.js                 # 📞 Basic voice agent (reference)
├── lib/                      # 🧩 Core modules
│   ├── state-machine.js      #    Conversation flow
│   ├── tools.js              #    OpenAI function definitions
│   ├── tool-executor.js      #    Tool execution logic
│   ├── prompts.js            #    Dynamic prompt builder
│   ├── attribution.js        #    Dealer tracking
│   └── metrics.js            #    Latency & lead metrics
├── api/                      # 🔌 External integrations
│   ├── hestia-client.js      #    API client factory
│   └── mock-hestia.js        #    In-memory mock
├── config/                   # ⚙️ Configuration
│   ├── questions.js          #    Question flow
│   └── enums.js              #    Valid values
└── tests/                    # 🧪 Test suite
    └── conversation-flow.test.js
```

## 🔄 Conversation Flow

```
┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐
│ Welcome │──▶│ Consent │──▶│ Contact │──▶│Property │──▶│  Land   │
└─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘
                  │                                           │
                  │ (decline)                                 ▼
                  ▼                           ┌─────────┐   ┌─────────┐
             ┌─────────┐                      │  Home   │──▶│Timeline │
             │End Call │                      └─────────┘   └─────────┘
             └─────────┘                                          │
                                                                  ▼
┌─────────────┐   ┌──────────┐   ┌─────────┐              ┌─────────┐
│ Prequalified│◀──│ Optional │◀──│Financial│◀─────────────│         │
└─────────────┘   └──────────┘   └─────────┘              └─────────┘
```

**Required for Prequalification:**
- ✅ Full name
- ✅ Phone number  
- ✅ Property ZIP & state
- ✅ Land status
- ✅ Home type
- ✅ Timeline
- ✅ Consent

## 🔧 Function Calling

The agent uses OpenAI function calling to extract structured data:

```javascript
// Example: Agent detects caller said "My name is John Smith"
{
  "tool_calls": [{
    "function": {
      "name": "collect_name",
      "arguments": {
        "full_name": "John Smith",
        "confidence": 0.95,
        "needs_confirmation": false
      }
    }
  }]
}
```

**Available Tools:**

| Category | Tools |
|----------|-------|
| Contact | `collect_consent`, `collect_name`, `collect_phone`, `collect_email` |
| Property | `collect_property_location`, `collect_land_status`, `collect_land_value` |
| Home | `collect_home_type`, `collect_timeline`, `collect_home_price` |
| Financial | `collect_credit_band`, `collect_income`, `collect_bankruptcy` |
| Control | `check_prequalification`, `skip_optional_questions`, `end_conversation` |

## 📊 Metrics

Access at `http://localhost:8080/metrics`:

```json
{
  "calls": {
    "total": 150,
    "prequalified": 89,
    "do_not_contact": 12
  },
  "rates": {
    "prequalification_rate": "59.3%"
  },
  "drop_off_by_phase": {
    "consent_check": 12,
    "financial_snapshot": 8
  },
  "latency": {
    "llm_ttft": { "p50": 298, "p95": 512 }
  }
}
```

## ⚙️ Configuration

### Environment Variables

```bash
# Required
OPENAI_API_KEY=sk-...
NGROK_URL=abc123.ngrok-free.app

# Optional
OPENAI_MODEL=gpt-4o-mini          # LLM model
TTS_PROVIDER=google               # google, amazon, elevenlabs
TTS_VOICE=en-US-Journey-F         # Voice ID
STT_PROVIDER=deepgram             # google, deepgram
HESTIA_MODE=mock                  # mock or live
```

### Twilio Setup

1. Enable ConversationRelay in Twilio Console
2. Configure phone number webhook: `https://your-ngrok-url/twiml`
3. Method: `POST`

## 🧪 Testing

```bash
# Run all tests
npm test

# Output
📋 State Machine Tests
  ✅ createSessionState creates valid initial state
  ✅ isPrequalificationReady returns true when all required fields collected
  ...

📊 Test Results: 22 passed, 0 failed
```

## 📈 Latency Targets

Based on [Twilio Best Practices](https://www.twilio.com/docs/voice/conversationrelay/best-practices):

| Metric | Target | Upper Limit |
|--------|--------|-------------|
| LLM TTFT | 375ms | 750ms |
| TTS TTFB | 100ms | 250ms |
| Platform Gap | 885ms | 1,100ms |

## 🔗 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/twiml` | GET/POST | TwiML for ConversationRelay |
| `/ws` | WebSocket | Real-time conversation |
| `/health` | GET | Server status |
| `/metrics` | GET | Aggregate metrics |
| `/debug/leads` | GET | Mock mode: view leads |

## 📚 Related Documentation

- [Hestia API Schema V2](./Hestia%20API%20Schema%20V2.md) - Lead data model
- [Hestia Voice Questions](./Hestia%20Voice%20Questions.md) - Question flow
- [Twilio ConversationRelay](https://www.twilio.com/docs/voice/conversationrelay)

## 📄 License

MIT
