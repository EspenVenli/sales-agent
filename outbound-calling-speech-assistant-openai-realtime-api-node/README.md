# AI Phone Agent

This application enables making outbound phone calls with an AI assistant that can have natural conversations using OpenAI's Realtime API and Twilio.

## Deployment to Vercel

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Login to Vercel:
```bash
vercel login
```

3. Deploy to Vercel:
```bash
vercel
```

4. Set up environment variables in Vercel:
- Go to your project settings in the Vercel dashboard
- Add the following environment variables:
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `PHONE_NUMBER_FROM`
  - `DOMAIN` (your Vercel deployment URL)
  - `OPENAI_API_KEY`
  - `N8N_WEBHOOK_URL`

5. Update your Twilio webhook URLs to point to your Vercel deployment URL.

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file with the required environment variables.

3. Start the development server:
```bash
npm run dev
```

## Features

- Real-time voice conversations using OpenAI's Realtime API
- WebSocket-based media streaming
- Call status monitoring dashboard
- Transcript generation and storage
- Integration with n8n for workflow automation

## Requirements

- Node.js >= 18.0.0
- Twilio account with voice capabilities
- OpenAI API key
- n8n instance (optional)

## License

ISC

## Prerequisites

- Node.js v18 or later
- A Twilio account with a phone number
- An OpenAI API key with access to the Realtime API
- ngrok or a similar service for exposing your local server to the internet

## Setup

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file with your credentials:
   ```
   TWILIO_ACCOUNT_SID="your_twilio_account_sid"
   TWILIO_AUTH_TOKEN="your_twilio_auth_token"
   PHONE_NUMBER_FROM="your_twilio_phone_number"
   DOMAIN="your_ngrok_domain" (without protocol or trailing slash)
   OPENAI_API_KEY="your_openai_api_key"
   ```

## Running the Application

1. Start ngrok to expose your local server:
   ```
   ngrok http 6060
   ```

2. Update the `DOMAIN` variable in your `.env` file with the ngrok URL (without `https://` or trailing slash).

3. Start the server:
   ```
   npm start
   ```

## Making a Call

You can make a call in two ways:

### 1. Using the /call API endpoint

Send a POST request to the `/call` endpoint:

```
curl -X POST http://localhost:6060/call \
  -H "Content-Type: application/json" \
  -d '{"phoneNumberTo": "+1234567890", "promptText": "You are a friendly AI assistant calling to check in."}'
```

### 2. Using the makeCall function directly

If you want to test calls programmatically, you can modify the code to call the `makeCall` function:

```javascript
makeCall('+1234567890');
```

For security reasons, you can only call phone numbers that are:
- Verified as outgoing caller IDs in your Twilio account
- Phone numbers owned by your Twilio account

## Checking Call Status

To check the status of a call, send a GET request to the `/status/:callSid` endpoint:

```
curl http://localhost:6060/status/CA123456789abcdef
```

## How It Works

1. The application uses Twilio to make outbound calls
2. When the call is answered, a WebSocket connection is established between Twilio and our server
3. Another WebSocket connection is established between our server and OpenAI's Realtime API
4. Audio from the call is streamed to OpenAI for processing in real-time
5. OpenAI processes the audio and generates responses on the fly
6. The responses are converted to speech and streamed back to the call

## Features

- Outbound calling using Twilio
- Real-time audio streaming and processing
- OpenAI GPT-4o Realtime API integration for natural conversations
- Customizable AI prompts
- Server-side Voice Activity Detection (VAD)
- WebSocket-based bidirectional communication
- Voice customization (currently using 'alloy')

## Customization

You can customize the AI's behavior by:
1. Modifying the `SYSTEM_MESSAGE` constant in `index.js`
2. Providing a custom prompt when making a call
3. Changing the `VOICE` constant to use different OpenAI voices
4. Adjusting the temperature setting in the session.update message

## Visualizing the Call Connection

The application includes a real-time dashboard that allows you to visualize the call connection and conversation flow. To access the dashboard:

1. Open your browser and navigate to `http://localhost:6060` or your ngrok URL
2. The dashboard shows:
   - Active and completed calls
   - Real-time connection status
   - Events from OpenAI and Twilio
   - Conversation logs including AI responses

The dashboard uses WebSockets to display real-time updates, allowing you to monitor:
- When calls connect
- The flow of conversation between the caller and AI
- OpenAI events and responses
- Any errors that occur during the call

This is particularly useful for debugging and understanding how the communication between Twilio, your server, and OpenAI works.

## WebSocket Implementation Details

The application uses a dual WebSocket architecture:

1. **Twilio Media WebSocket**: Twilio connects to our `/media-stream` endpoint to send and receive audio.

2. **OpenAI Realtime WebSocket**: Our server connects to OpenAI's Realtime API at `wss://api.openai.com/v1/realtime`.

The communication flow works like this:

1. When a call is answered, Twilio establishes a WebSocket connection to our server.
2. Our server connects to OpenAI's Realtime API and establishes a session.
3. We send an initial greeting prompt to OpenAI to start the conversation.
4. Audio from the caller is sent from Twilio to our server using `media` events.
5. We forward this audio to OpenAI using `input_audio_buffer.append` messages.
6. OpenAI sends back audio responses as `response.audio.delta` events.
7. We forward these responses back to Twilio to be played to the caller.

### Important API Events

- **From Twilio**:
  - `start`: Indicates the beginning of a media stream
  - `media`: Contains audio data from the caller
  - `stop`: Indicates the end of the connection

- **To OpenAI**:
  - `session.update`: Sets parameters like voice, audio format, and system instructions
  - `conversation.item.create`: Creates a new message in the conversation
  - `input_audio_buffer.append`: Sends audio data from the caller
  - `response.create`: Requests a response from the assistant

- **From OpenAI**:
  - `session.updated`: Confirms session parameters were applied
  - `response.audio.delta`: Contains chunks of audio response
  - Various events for turn taking and audio processing

## Note

This implementation uses OpenAI's latest Realtime API which provides better conversation handling with minimal latency. In a production environment, you would need to implement:

1. Robust error handling and reconnection logic
2. User authentication and authorization
3. Rate limiting and billing management
4. Call recording and logging (with proper consent)
5. Analytics and conversation tracking
6. Fallback mechanisms for handling API outages 