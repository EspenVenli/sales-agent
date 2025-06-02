# Sales Agent AI Calling System

An AI-powered sales agent that can make outbound calls to prospects using OpenAI's Realtime API and Twilio. The system includes a web interface for scheduling calls with comprehensive prospect information and a dashboard for monitoring call activity.

## Features

- 🎯 **AI Sales Agent**: Professional sales conversations using OpenAI's advanced voice model
- 📊 **Lead Management**: Comprehensive form for capturing prospect information
- 📞 **Outbound Calling**: Automated calling system using Twilio
- 📈 **Real-time Dashboard**: Monitor active calls and conversion rates
- 🔄 **Call Status Tracking**: Real-time updates on call progress
- 📝 **Lead Qualification**: AI agent designed to qualify leads and schedule demos
- 🌐 **Web Interface**: Modern, responsive UI for sales teams

## Sales Agent Capabilities

The AI sales agent is designed to:
- Introduce themselves professionally
- Qualify prospects based on provided context
- Ask discovery questions about business challenges
- Present value propositions based on prospect needs
- Schedule product demonstrations
- Handle objections professionally
- Maintain conversation flow and rapport

## Prerequisites

- **Node.js 18+**
- **Twilio Account** with Phone Number
- **OpenAI API Key** with Realtime API access
- **ngrok** or similar for local development (optional)

## Environment Setup

1. **Clone and Install**
```bash
cd outbound-calling-speech-assistant-openai-realtime-api-node
npm install
```

2. **Configure Environment Variables**
```bash
cp .env.example .env
```

Edit `.env` with your credentials:
```env
# Twilio Credentials
TWILIO_ACCOUNT_SID=your_twilio_account_sid_here
TWILIO_AUTH_TOKEN=your_twilio_auth_token_here
PHONE_NUMBER_FROM=+1234567890

# OpenAI API Key
OPENAI_API_KEY=your_openai_api_key_here

# Server Configuration
DOMAIN=localhost:6060
PORT=6060

# Optional Webhooks (for lead management integrations)
N8N_WEBHOOK_URL=
N8N_EMAIL_WEBHOOK_URL=
```

## Running Locally

### Start the Server
```bash
npm start
```

The server will start on http://localhost:6060

### Access the Interface
- **Sales Dashboard**: http://localhost:6060/
- **Schedule New Call**: http://localhost:6060/call-request.html

## Usage

### Scheduling a Sales Call

1. **Go to the call request form**: http://localhost:6060/call-request.html

2. **Fill out prospect information**:
   - Basic info (name, phone, email, company)
   - Company details (industry, size, job title)
   - Sales context (pain points, budget, timeline)
   - Call objective and previous contact history

3. **Submit the form** to initiate the call

4. **Monitor progress** on the dashboard

### Sales Form Fields

**Required:**
- First Name & Last Name
- Phone Number (with country code)
- Company Name
- Industry

**Optional but Recommended:**
- Job Title
- Company Size
- Lead Source
- Pain Points
- Budget Range
- Decision Timeline
- Previous Contact History
- Call Objective
- Additional Notes

### Call Priorities

- 🔥 **High Priority (Hot)**: Urgent prospects, immediate attention
- ⚡ **Medium Priority (Warm)**: Standard lead processing
- ❄️ **Low Priority (Cold)**: Lower priority, basic qualification

## API Endpoints

### Sales Call Management
- `POST /api/call` - Schedule a new sales call
- `GET /api/call/status/{callSid}` - Get call status
- `GET /` - Sales dashboard
- `GET /call-request.html` - Call request form

### Legacy Endpoints (for compatibility)
- `POST /make-call` - Original call endpoint
- `GET /status/{callSid}` - Original status endpoint

## Dashboard Features

- **Real-time call monitoring**
- **Conversion rate tracking**
- **Active call management**
- **Call history and logs**
- **Performance metrics**

## Sales Agent Personality

The AI agent (Alex) is configured to:
- Be professional but personable
- Build rapport naturally
- Ask discovery questions
- Listen actively to prospect needs
- Present relevant value propositions
- Schedule demos as the primary goal
- Handle objections respectfully
- End calls politely if not interested

## Phone Number Allowlist

For compliance and testing, the system includes a phone number allowlist in the code. Update the `isNumberAllowed()` function to include your test numbers:

```javascript
global.allowedNumbers = {
  "+1234567890": true,  // Add your numbers here
  "+0987654321": true,
};
```

## Webhooks & Integrations

The system supports optional webhook integrations for:
- **Lead data processing** (N8N_EMAIL_WEBHOOK_URL)
- **Call transcript analysis** (N8N_WEBHOOK_URL)

## Compliance Notes

⚠️ **Important**: Always disclose the use of AI for outbound calls. All TCPA rules apply even when calls are made by AI. Consult with your legal counsel for compliance advice.

## Troubleshooting

### Common Issues

1. **Calls not connecting**
   - Check phone number is in allowlist
   - Verify Twilio credentials
   - Ensure phone number format includes country code

2. **OpenAI connection fails**
   - Verify API key has Realtime API access
   - Check internet connection
   - Review console logs for specific errors

3. **Dashboard not updating**
   - Check WebSocket connection in browser console
   - Verify server is running on correct port
   - Refresh the page

### Debug Mode

Enable detailed logging by checking the server console output. All events are logged with timestamps and call SIDs for troubleshooting.

## Development

### Project Structure
```
├── public/                 # Frontend files
│   ├── dashboard.html     # Sales dashboard
│   ├── call-request.html  # Call scheduling form
│   └── index.html         # Redirect to dashboard
├── index.js               # Main server file
├── package.json           # Dependencies
└── README.md             # This file
```

### Making Changes

1. **Frontend changes**: Edit files in `public/` directory
2. **Backend changes**: Modify `index.js`
3. **Sales agent personality**: Update `buildSystemMessage()` function
4. **Form fields**: Modify `call-request.html`

## License

This project is provided as-is for educational and development purposes. Please ensure compliance with all applicable laws and regulations when using for commercial purposes. 