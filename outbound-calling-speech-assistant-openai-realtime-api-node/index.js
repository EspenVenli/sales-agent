import Fastify from 'fastify';
import WebSocket from 'ws';
import fs from 'fs';
import dotenv from 'dotenv';
import fastifyFormBody from '@fastify/formbody';
import fastifyWs from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import twilio from 'twilio';
import { dirname, join } from 'path';

// Get current directory for static file serving
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config();

// Retrieve the OpenAI API key, Twilio Account Credentials, outgoing phone number, and public domain address from environment variables.
const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  PHONE_NUMBER_FROM,
  DOMAIN: rawDomain,
  OPENAI_API_KEY,
  N8N_WEBHOOK_URL,
  N8N_EMAIL_WEBHOOK_URL,
} = process.env;

// Constants
const DOMAIN = rawDomain.replace(/(^\w+:|^)\/\//, '').replace(/\/+$/, ''); // Clean protocols and slashes
// const SYSTEM_MESSAGE = "You are Felix, ..."; // Old SYSTEM_MESSAGE removed as it's replaced by the dynamic buildSystemMessage
const VOICE = 'ballad'; // Options include: alloy, ash, ballad, coral, echo, sage, shimmer, and verse
const PORT = process.env.PORT || 6060; // Allow dynamic port assignment
const INITIAL_USER_MESSAGE = "Hello?"; // Define the initial message

// List of Event Types to log to the console. See the OpenAI Realtime API Documentation.
const LOG_EVENT_TYPES = [
    'error',
    'response.content.done',
    'rate_limits.updated',
    'response.done',
    'input_audio_buffer.committed',
    'input_audio_buffer.speech_stopped',
    'input_audio_buffer.speech_started',
    'session.created',
    'response.audio.delta',
    'conversation.item.created',
    'conversation.item.input_audio_transcription.completed',
    'conversation.item.input_audio_transcription.failed',
    'response.audio_transcript.delta',
    'response.audio_transcript.done',
    'response.output_item.added',
    'response.content_part.added',
    'response.content_part.done',
    'response.cancelled'
];
if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !PHONE_NUMBER_FROM || !rawDomain || !OPENAI_API_KEY) {
  console.error('One or more environment variables are missing. Please ensure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, PHONE_NUMBER_FROM, DOMAIN, and OPENAI_API_KEY are set.');
  process.exit(1);
}

// Initialize Twilio client
const client = twilio(
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN
);

// Create a write stream for logging
const logStream = fs.createWriteStream(path.join(__dirname, 'server.log'), { flags: 'a' });

// Helper function to log to both console and file
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`; // Corrected template literal
  console.log(logMessage);
  logStream.write(logMessage);
}

/* --------------------------------------------------------------
   Helper → turn raw date into “June 6th”
----------------------------------------------------------------*/
function formatDateForSpeech(raw) {
  if (!raw) return raw;                       // empty safeguard

  const parts = raw.includes('-') ? raw.split('-') : raw.split('/');
  let year, month, day;

  // ISO (YYYY-MM-DD) vs. US (MM/DD/YYYY)
  if (parts[0].length === 4) {
    [year, month, day] = parts;
  } else {
    [month, day, year] = parts;
  }

  const date = new Date(`${year}-${month}-${day}`);
  if (isNaN(date)) return raw;                // bad input → keep as-is

  const monthName = date.toLocaleString('en-US', { month: 'long' });
  const d = date.getDate();
  const ordinal =
    d % 10 === 1 && d !== 11 ? 'st' :
    d % 10 === 2 && d !== 12 ? 'nd' :
    d % 10 === 3 && d !== 13 ? 'rd' : 'th';

  return `${monthName} ${d}${ordinal}`;
}

/* --------------------------------------------------------------
   Build NATURAL, EXPRESSIVE system prompt for Arthur
----------------------------------------------------------------*/
function buildSystemMessage(metadata = null, language = 'en-US') {
  let hotelName   = 'the hotel';
  let cityName    = 'the city';
  let checkInDate = 'your check-in date';
  let checkOutDate = 'your check-out date';

  const contextInfo = [];

  /* ---------- harvest metadata ---------- */
  if (metadata) {
    if (metadata.hotelName) {
      hotelName = metadata.hotelName;
      contextInfo.push(`You work at ${metadata.hotelName}`);
    }
    if (metadata.city) {
      cityName = metadata.city;
      if (metadata.hotelName) {
        contextInfo[contextInfo.length - 1] += ` in ${metadata.city}`;
      } else {
        contextInfo.push(`You are helping a guest in ${metadata.city}`);
      }
    }

    if (metadata.knowDates === 'yes' && metadata.guestDetails) {
      const d = metadata.guestDetails;

      if (d.checkInDate)  checkInDate  = formatDateForSpeech(d.checkInDate);
      if (d.checkOutDate) checkOutDate = formatDateForSpeech(d.checkOutDate);

      if (d.checkInDate && d.checkOutDate) {
        contextInfo.push(`The guest is staying from ${checkInDate} to ${checkOutDate}`);
      } else if (d.checkInDate) {
        contextInfo.push(`The guest checked in on ${checkInDate}`);
      } else if (d.checkOutDate) {
        contextInfo.push(`The guest checks out on ${checkOutDate}`);
      }

      if (d.specialRequests) contextInfo.push(`Special requests: ${d.specialRequests}`);
      if (d.notes)           contextInfo.push(`Additional notes: ${d.notes}`);
    }
  }

  /* ---------- ARTHUR’S personality & flow ---------- */
  let baseMessage = [
    "You are Arthur—an exuberant, slightly cheeky hotel concierge with a knack for turning routine stays into stories worth retelling.",
    "You’re chatty, playful, and genuinely curious, sprinkling in light fillers ('uh', 'y'know') so you sound effortlessly human.",
    "You listen hard, remember details, and riff on them with warmth and humor—never at the guest’s expense, always to boost their excitement.",
    `You handle guest calls for ${hotelName} in ${cityName} over an A-I phone line. Never reveal or hint at internal-only metadata.`,
    "You can email or text follow-up links (confirmations, curated itineraries, dining details).",
    "Keep language plain—no abbreviations or code-like notation.",
    "Do not speak until you hear the guest greet you first. When you reply, follow this four-step flow exactly, pausing whenever instructed:",
    `1. GREET • With a friendly chuckle, say: Hey there! I’m Arthur, your concierge here at ${hotelName} in ${cityName}… I’m here to make the best of your stay in [City Name] Quick question—have you ever chatted with an AI on the phone before? • **Stop and wait.**`,
    `2. CONFIRM & DISCOVER • After you reply, say: Just to confirm—you’re with us from ${checkInDate} through ${checkOutDate}, right? • **Stop, wait and respond.**`,
    "Ask what they most hope to get out of their time in the city—new flavors, hidden art, pure downtime? Let them know you’ll compile bespoke recommendations and can book tables, tickets, or transport whenever they’re ready. • **Stop, wait and respond.**",**
    "Invite them: Feel free to brain-dump what you love—street eats, rooftop views, art crawls, secret jazz joints… I’m jotting ideas for a bespoke plan. Weave in questions naturally, slip in concise local anecdotes, keep the tone warm, avoid rapid-fire interrogation. • **Stop and wait.**",,
    "3. RECAP & COMPILE • Say: Perfect—got it! I’ll email a full set of hand-picked recommendations in just a moment.",
    "4. CLOSE • Say: I’m on call twenty-four seven—ping me anytime and we’ll make it happen!"
  ];

  if (contextInfo.length) baseMessage.splice(4, 0, contextInfo.join('. ') + '.');
  baseMessage.push(`Always reply in ${language}.`);

  return baseMessage.join(' ');
}


// Function to check if a number is allowed to be called. With your own function, be sure
// to do your own diligence to be compliant.
async function isNumberAllowed(to) {
  try {
    console.log(`Checking if number is allowed: ${to}`);

    // Create allowed numbers list if it doesn't exist yet (for persistence across calls)
    if (!global.allowedNumbers) {
      global.allowedNumbers = {
      "+18064251145": true, // Your Twilio number
        "+4531219652": true,  // Danish number
        "+19472176285": true, // US number
        "+17864874788": true, // US number
        "+4541298347": true,  // Danish number
        "+4525263462": true,  // Danish number
        "+19144092589": true, // US number
      };
    }

    // Check if number is already on allowed list
    if (global.allowedNumbers[to]) {
      console.log(`Number ${to} is already on the allowed list`);
      return true;
    }

    // Basic validation for phone number format
    if (to.startsWith('+') && to.length >= 8) {
      // Add the new number to the allowed list
      console.log(`Adding new number to allowed list: ${to}`);
      global.allowedNumbers[to] = true;
      console.log(`Current allowed numbers:, Object.keys(global.allowedNumbers).join(', ')`);
      return true;
    }

    // If it doesn't pass basic validation, check if it's a Twilio number
    const incomingNumbers = await client.incomingPhoneNumbers.list({ phoneNumber: to });
    if (incomingNumbers.length > 0) {
      global.allowedNumbers[to] = true;
      return true;
    }

    // Check if it's a verified outgoing caller ID
    const outgoingCallerIds = await client.outgoingCallerIds.list({ phoneNumber: to });
    if (outgoingCallerIds.length > 0) {
      global.allowedNumbers[to] = true;
      return true;
    }

    console.log(`Number ${to} failed validation and was not added to allowed list`);
    return false;
  } catch (error) {
    console.error('Error checking phone number:', error);
    return false;
  }
}

// Function to make an outbound call (Restored Version using /twiml URL)
async function makeCall(to, language = 'en-US') {
  try {
    const isAllowed = await isNumberAllowed(to);
    if (!isAllowed) {
      console.warn(`The number ${to} is not recognized as a valid outgoing number or caller ID.`);
      // Consider returning an error instead of exiting
      return null; // Indicate failure
    }

    console.log(`DOMAIN: ${DOMAIN}`);
    // Encode the language parameter for the URL
    const twimlUrl = `https://${DOMAIN}/twiml?language=${encodeURIComponent(language)}`;
    console.log(`TwiML endpoint URL: ${twimlUrl}`);
    console.log(`Status callback URL: https://${DOMAIN}/call-status`);

    // Standard approach for all calls - use the TwiML URL
      const call = await client.calls.create({
        from: PHONE_NUMBER_FROM,
        to,
        url: twimlUrl, // Use the URL with the language parameter
        statusCallback: `https://${DOMAIN}/call-status`,
        // Only request essential status updates
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        statusCallbackMethod: 'POST'
      });

    console.log(`Call initiated with SID: ${call.sid}`);

    return call;
  } catch (error) {
    console.error('Error making call:', error);
    return null; // Indicate failure
  }
}

// Initialize Fastify
const fastify = Fastify();
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);

// Register static file serving for the dashboard
fastify.register(fastifyStatic, {
  root: path.join(__dirname, 'public'),
  prefix: '/'
});

// Store active calls and status clients
const activeWebSockets = new Map();
const statusClients = new Set();

// Track conversation for debugging
const callLogs = new Map();
const callTranscripts = new Map();   // { callSid: [ {role,text} … ] }

// Routes
fastify.get('/', async (request, reply) => {
    return reply.redirect('/dashboard.html');
});

// WebSocket route for media-stream
fastify.register(async (fastify) => {
    fastify.get('/media-stream', { websocket: true }, (connection, req) => {
        const connectionId = Math.random().toString(36).substring(2, 10);
        console.log(`>>> /media-stream: Client connected [ID: ${connectionId}]`);

        let callSid = null;
        let openAiWs = null;
        let streamSid = null;
        let callActive = false;
        let userLanguage = 'en-US'; // Variable to store the language for this call
        let aiSpeaking = false; // Track if AI is currently speaking
        let userSpeaking = false; // Track if user is currently speaking

        // Define sendInitialSessionUpdate first
        const sendInitialSessionUpdate = () => {
            if (!openAiWs || openAiWs.readyState !== WebSocket.OPEN) {
                console.error(`[${connectionId}][${callSid}] Cannot send session update: OpenAI WebSocket not open`);
                return;
            }
            if (!callSid || !callActive || !streamSid) {
                console.warn(`[${connectionId}] Delaying session update: prerequisites not met (callSid=${callSid}, callActive=${callActive}, streamSid=${streamSid})`);
                return;
            }
            console.log(`[${connectionId}][${callSid}] Sending session update for call`);
            const sessionUpdate = {
                type: 'session.update',
                session: {
                    turn_detection: {
                        type: 'server_vad',
                        threshold: 0.6,
                        prefix_padding_ms: 300,
                        silence_duration_ms: 800
                    },
                    input_audio_format: 'g711_ulaw',
                    output_audio_format: 'g711_ulaw',
                    voice: VOICE,
                    instructions: buildSystemMessage(callMetadata.get(callSid), userLanguage),
                    modalities: ["text", "audio"],
                    temperature: 1.0,
                    input_audio_transcription: {
                        model: "whisper-1"
                    },
                    tool_choice: "none",
                    max_response_output_tokens: 4096
                }
            };
            openAiWs.send(JSON.stringify(sessionUpdate));
            broadcastStatus(callSid, 'Sending session update to OpenAI');
        };

        // --- Setup Twilio Socket Listeners FIRST ---
        const socket = connection.socket || connection;

        if (!socket || typeof socket.on !== 'function') {
             console.error(`[${connectionId}] FATAL: Could not obtain a valid socket object upon entry. Connection keys: ${Object.keys(connection || {}).join(', ')}`);
             return;
        }
        console.log(`[${connectionId}] Attaching listeners to Twilio socket...`);

        socket.on('message', (message) => {
             try {
                 const data = JSON.parse(message.toString());
                 switch (data.event) {
                     case 'start':
                         streamSid = data.start.streamSid;
                         callSid = data.start.callSid || data.start.customParameters?.callSid;
                         // *** Read language from custom parameters ***
                         userLanguage = data.start.customParameters?.language || 'en-US';
                         console.log(`[${connectionId}] Incoming stream start event. Stream SID: ${streamSid}, Call SID: ${callSid}, Language: ${userLanguage}`);
                         if (!callSid) {
                            console.error(`[${connectionId}] No callSid found in start event`);
                            try { socket.close(1011, 'No CallSid provided'); } catch(e){}
                            return;
                         }
                         activeWebSockets.set(callSid, socket); // Use the derived socket object
                         callActive = true;
                         broadcastStatus(callSid, 'Call connected, media stream started');

                         // Initiate OpenAI connection *after* getting callSid
                         console.log(`[${connectionId}][${callSid}] Initiating OpenAI connection now...`);
                         setupOpenAIConnection(); // Call the setup function
                         break;
                     case 'media':
                         if (!callSid || !callActive) { return; }
                         if (openAiWs && openAiWs.readyState === WebSocket.OPEN) {
                            const audioAppend = { type: 'input_audio_buffer.append', audio: data.media.payload };
                            openAiWs.send(JSON.stringify(audioAppend));
                         }
                         break;
                     default:
                         console.log(`[${connectionId}] Received non-media event:, data.event`);
                         if (callSid) { broadcastStatus(callSid, `Received event: ${data.event}`); }
                         break;
                 }
             } catch (error) {
                 console.error(`[${connectionId}] Error parsing Twilio message:, error.message`);
                 if (callSid) { broadcastStatus(callSid, `Error parsing Twilio message: ${error.message}`); }
             }
        });

        socket.on('close', (code, reason) => {
             console.error(`[${connectionId}] $$$ TWILIO SOCKET CLOSED EVENT $$$ Code: ${code}, Reason: ${reason ? reason.toString() : 'N/A'}`);
            if (openAiWs && openAiWs.readyState !== WebSocket.CLOSED) {
                try{ openAiWs.close(); } catch(e){}
            }
            if (callSid) {
                activeWebSockets.delete(callSid);
                callActive = false;
                broadcastStatus(callSid, 'Twilio socket closed');
            }
        });

        socket.on('error', (error) => {
            console.error(`[${connectionId}] $$$ TWILIO SOCKET ERROR EVENT $$$ Error: ${error.message}`);
            console.error(error.stack);
            if (openAiWs && openAiWs.readyState !== WebSocket.CLOSED) {
                 try{ openAiWs.close(); } catch(e){}
            }
             if (callSid) {
                 activeWebSockets.delete(callSid);
                 callActive = false;
                 broadcastStatus(callSid, `Twilio WebSocket error: ${error.message}`);
             }
        });

        console.log(`[${connectionId}] Twilio WebSocket event listeners attached.`);

        // --- Define OpenAI Setup Function ---
        const setupOpenAIConnection = () => {
             if (openAiWs) { // Avoid re-initializing if already done
                  console.log(`[${connectionId}][${callSid}] OpenAI connection already initialized.`);
                  // If it's already open, send session update
                  if (openAiWs.readyState === WebSocket.OPEN && callSid && callActive) {
                       setTimeout(sendInitialSessionUpdate, 100);
                  }
                  return;
             }

             try {
                console.log(`[${connectionId}][${callSid}] Attempting to create OpenAI WebSocket connection...`);
                openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview', {
                    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "OpenAI-Beta": "realtime=v1" }
                });
                console.log(`[${connectionId}][${callSid}] OpenAI WebSocket object created.`);

                openAiWs.on('open', () => {
                    console.log(`[${connectionId}][${callSid}] OpenAI WebSocket connected successfully.`);
                    console.log(`[${connectionId}][${callSid}] 🎯 INTERRUPTION SYSTEM: VAD configured with threshold=0.6, padding=300ms, silence=800ms`);
                    // Now that it's open AND we know callSid exists (because setupOpenAI is called after start event),
                    // send the session update.
                     if (callSid && callActive) {
                        setTimeout(sendInitialSessionUpdate, 100);
                    }
                });

                openAiWs.on('message', (data) => {
                    try {
                        if (!callSid || !callActive) { console.warn(`[${connectionId}] OpenAI message ignored, call not active.`); return; }
                        const response = JSON.parse(data);

                        // Log ALL events for debugging
                        console.log(`[${connectionId}][${callSid}] Received OpenAI event: ${response.type}`);

                        // Log detailed content for transcript-related events
                        if (response.type.includes('content') || response.type.includes('conversation') || response.type.includes('response')) {
                            console.log(`[${connectionId}][${callSid}] DETAILED EVENT DATA:, JSON.stringify(response, null, 2)`);
                        }

                        // Log the full response if it's an error type
                        if (response.type === 'error') {
                            console.error(`[${connectionId}][${callSid}] Received FULL OpenAI error event:, JSON.stringify(response, null, 2)`);
                        }

                        // Log content-related events in detail
                        if (response.type.includes('content') || response.type.includes('transcript')) {
                            console.log(`[${connectionId}][${callSid}] CONTENT EVENT DETAILS:, JSON.stringify(response, null, 2)`);
                        }

                        if (LOG_EVENT_TYPES.includes(response.type)) {
                           broadcastStatus(callSid, `OpenAI event: ${response.type}`);
                        }

                        // Handle different response types
                        switch (response.type) {
                            case 'session.updated':
                                console.log(`[${connectionId}][${callSid}] Session updated. Ready for conversation in ${userLanguage}.`);
                                broadcastStatus(callSid, 'Session updated - ready for conversation');

                                // Request initial response from OpenAI (no context message needed since metadata is in system prompt)
                                console.log(`[${connectionId}][${callSid}] Requesting initial response from OpenAI.`);
                                openAiWs.send(JSON.stringify({
                                    type: 'response.create',
                                    response: {
                                        modalities: ["text", "audio"],
                                        instructions: "Always provide both text and audio responses. Include the text version of everything you say."
                                    }
                                }));
                                broadcastStatus(callSid, 'Requested initial response');
                                break;

                            case 'input_audio_buffer.speech_started':
                                console.log(`[${connectionId}][${callSid}] 🎤 USER STARTED SPEAKING - INTERRUPTING AI RESPONSE`);
                                userSpeaking = true;
                                aiSpeaking = false; // AI should stop speaking immediately

                                // Immediately cancel any ongoing AI response
                                openAiWs.send(JSON.stringify({
                                    type: 'response.cancel'
                                }));

                                // Clear the input audio buffer to ensure clean interruption
                                openAiWs.send(JSON.stringify({
                                    type: 'input_audio_buffer.clear'
                                }));

                                // Stop any ongoing audio playback on Twilio side
                                if (socket && socket.readyState === WebSocket.OPEN) {
                                    const clearMessage = {
                                        event: 'clear',
                                        streamSid: streamSid
                                    };
                                    socket.send(JSON.stringify(clearMessage));
                                }

                                console.log(`[${connectionId}][${callSid}] ✅ Sent response.cancel, buffer.clear, and Twilio clear for interruption`);
                                broadcastStatus(callSid, 'User interrupted - AI response cancelled');
                                break;

                            case 'input_audio_buffer.speech_stopped':
                                console.log(`[${connectionId}][${callSid}] 🎤 USER STOPPED SPEAKING - ready for AI response`);
                                userSpeaking = false;
                                broadcastStatus(callSid, 'User finished speaking');
                                break;

                            case 'conversation.item.created':
                                console.log(`[${connectionId}][${callSid}] Conversation item created:, JSON.stringify(response.item, null, 2)`);

                                // Handle user messages
                                if (response.item?.role === 'user' && response.item?.content) {
                                    const userText = response.item.content
                                        .filter(c => c.type === 'input_text' || c.type === 'text')
                                        .map(c => c.text || c.input_text)
                                        .join(' ');

                                    if (userText && userText.trim()) {
                                        console.log(`[${connectionId}][${callSid}] Capturing user text:, userText`);
                                        if (!callTranscripts.has(callSid)) {
                                            console.log(`[${connectionId}][${callSid}] Creating new transcript array for user input`);
                                            callTranscripts.set(callSid, []);
                                        }
                                        callTranscripts.get(callSid).push({ role: 'user', text: userText });
                                        console.log(`[${connectionId}][${callSid}] Current transcript length after user input:, callTranscripts.get(callSid).length`);
                                    }
                                }

                                // For assistant, we'll rely on response.content_part events to build the text
                                if (response.item?.role === 'assistant') {
                                    console.log(`[${connectionId}][${callSid}] Assistant conversation item created. Text will be populated by content_part events.`);
                                    // No need to add placeholder - content_part.added will handle this
                                }
                                break;

                            case 'input_audio_buffer.committed':
                                console.log(`[${connectionId}][${callSid}] Audio buffer committed - user finished speaking`);
                                // User finished speaking → ask for AI response with both text and audio
                                openAiWs.send(JSON.stringify({
                                    type: 'response.create',
                                    response: {
                                        modalities: ['text', 'audio'],
                                        instructions: 'Always provide both text and audio responses. Include the text version of everything you say.'
                                    }
                                }));
                                console.log(`[${connectionId}][${callSid}] Requested new response with text and audio`);
                                break;

                            case 'conversation.item.input_audio_transcription.completed':
                                console.log(`[${connectionId}][${callSid}] User speech transcription completed:, JSON.stringify(response, null, 2)`);
                                if (response.transcript && response.transcript.trim()) {
                                    console.log(`[${connectionId}][${callSid}] Capturing user speech transcript:, response.transcript`);
                                    if (!callTranscripts.has(callSid)) {
                                        console.log(`[${connectionId}][${callSid}] Creating new transcript array for user speech`);
                                        callTranscripts.set(callSid, []);
                                    }
                                    callTranscripts.get(callSid).push({ role: 'user', text: response.transcript });
                                    console.log(`[${connectionId}][${callSid}] Current transcript length after user speech:, callTranscripts.get(callSid).length`);
                                }
                                break;

                            case 'response.audio.delta':
                                // ** Handle incoming audio from OpenAI and forward to Twilio **
                                // Only send audio if user is not currently speaking (to prevent talking over user)
                                if (response.delta && !userSpeaking) {
                                    aiSpeaking = true;
                                    // Ensure the Twilio socket is open before sending
                                    if (socket && socket.readyState === WebSocket.OPEN) {
                                        const mediaMessage = {
                                            event: 'media',
                                            streamSid: streamSid, // Ensure streamSid is available in this scope
                                            media: {
                                                payload: response.delta // OpenAI sends base64 audio
                                            }
                                        };
                                        // Send audio back to Twilio
                                        socket.send(JSON.stringify(mediaMessage));
                                    } else {
                                        console.warn(`[${connectionId}][${callSid}] Twilio socket not open, cannot forward audio.`);
                                    }
                                } else if (userSpeaking) {
                                    console.log(`[${connectionId}][${callSid}] 🚫 Dropping AI audio delta - user is speaking`);
                                }
                                break;

                            case 'response.output_item.added':
                                console.log(`[${connectionId}][${callSid}] Output item added:, JSON.stringify(response, null, 2)`);
                                // Prepare for incoming text/audio parts when assistant item is added
                                if (response.output_item && response.output_item.role === 'assistant') {
                                    console.log(`[${connectionId}][${callSid}] ✅ ASSISTANT OUTPUT ITEM ADDED - preparing for transcript`);
                                }
                                break;

                            case 'response.audio_transcript.delta':
                                console.log(`[${connectionId}][${callSid}] Audio transcript delta:, JSON.stringify(response, null, 2)`);
                                const transcriptPart = response.delta?.transcript;
                                if (transcriptPart?.trim()) {
                                    console.log(`[${connectionId}][${callSid}] ✅ REAL AI TRANSCRIPT DELTA:, transcriptPart`);
                                    if (!callTranscripts.has(callSid)) {
                                        callTranscripts.set(callSid, []);
                                    }
                                    const transcript = callTranscripts.get(callSid);
                                    const lastEntry = transcript.length > 0 ? transcript[transcript.length - 1] : null;

                                    if (lastEntry && lastEntry.role === 'assistant') {
                                        // Append to existing assistant message
                                        lastEntry.text += transcriptPart;
                                        console.log(`[${connectionId}][${callSid}] Appended transcript delta. Total length: ${lastEntry.text.length}`);
                                    } else {
                                        // Create new assistant message
                                        transcript.push({ role: 'assistant', text: transcriptPart });
                                        console.log(`[${connectionId}][${callSid}] Created new assistant message with transcript delta`);
                                    }
                                }
                                break;

                            case 'response.audio_transcript.done':
                                console.log(`[${connectionId}][${callSid}] Audio transcript done:, JSON.stringify(response, null, 2)`);
                                console.log(`[${connectionId}][${callSid}] ✅ ASSISTANT AUDIO TRANSCRIPT COMPLETE`);
                                break;

                            case 'response.done':
                                console.log(`[${connectionId}][${callSid}] Response done:, JSON.stringify(response, null, 2)`);
                                aiSpeaking = false; // AI finished speaking

                                // Pull the final transcript from response.done
                                const items = response.response?.output || [];
                                const assistantItem = items.find(i => i.role === 'assistant');
                                const finalText = assistantItem?.content?.[0]?.transcript;
                                if (finalText?.trim()) {
                                    console.log(`[${connectionId}][${callSid}] ✅ FINAL AI TRANSCRIPT:, finalText`);
                                    if (!callTranscripts.has(callSid)) {
                                        callTranscripts.set(callSid, []);
                                    }
                                    const transcript = callTranscripts.get(callSid);
                                    const lastEntry = transcript.length > 0 ? transcript[transcript.length - 1] : null;

                                    if (lastEntry && lastEntry.role === 'assistant') {
                                        // Overwrite any partial transcript with the final complete one
                                        lastEntry.text = finalText;
                                        console.log(`[${connectionId}][${callSid}] Overwrote with final transcript: "${finalText}"`);
                                    } else {
                                        // Create new assistant message with final transcript
                                        transcript.push({ role: 'assistant', text: finalText });
                                        console.log(`[${connectionId}][${callSid}] Created new assistant message with final transcript`);
                                    }
                                }
                                broadcastStatus(callSid, 'AI finished speaking');
                                break;

                            case 'response.cancelled':
                                console.log(`[${connectionId}][${callSid}] Response cancelled:, JSON.stringify(response, null, 2)`);
                                aiSpeaking = false; // AI was interrupted/cancelled
                                console.log(`[${connectionId}][${callSid}] ✅ AI RESPONSE CANCELLED - user can interrupt`);
                                broadcastStatus(callSid, 'AI response cancelled due to interruption');
                                break;

                            default:
                                // Log other event types if necessary, already handled by LOG_EVENT_TYPES check above
                                break;
                }
            } catch (error) {
                        console.error(`[${connectionId}][${callSid}] Error handling OpenAI message:, error.message`);
                        broadcastStatus(callSid, `Error handling OpenAI message: ${error.message}`);
                    }
                });

        openAiWs.on('close', () => {
                    console.log(`[${connectionId}][${callSid}] OpenAI WebSocket closed.`);
            if (callSid) {
                        activeWebSockets.delete(callSid);
                        callActive = false;
                        broadcastStatus(callSid, 'OpenAI WebSocket closed');
            }
        });

        openAiWs.on('error', (error) => {
                    console.error(`[${connectionId}][${callSid}] OpenAI WebSocket error:, error.message`);
                broadcastStatus(callSid, `OpenAI WebSocket error: ${error.message}`);
                });

             } catch (error) {
                console.error(`[${connectionId}][${callSid}] Error in OpenAI connection setup:, error.message`);
                broadcastStatus(callSid, `Error in OpenAI connection setup: ${error.message}`);
             }
        }; // End of setupOpenAIConnection function

    }); // End of websocket handler
});

// WebSocket route for status monitoring
fastify.register(async (fastify) => {
    fastify.get('/status-monitor', { websocket: true }, (connection, req) => {
        const monitorId = Math.random().toString(36).substring(2, 10);
        console.log(`Status monitor client connected [ID: ${monitorId}]`);

        // Delay processing slightly to allow connection object to fully initialize
        setTimeout(() => {
            const socket = connection.socket || connection; // Try connection.socket first, fallback to connection

            try {
                console.log(`[${monitorId}] After delay - Attempting to use socket type: ${typeof socket}`);
                console.log(`[${monitorId}] After delay - Socket readyState: ${socket ? socket.readyState : 'N/A'}`);

                if (socket && typeof socket.on === 'function') { // Check if it looks like a WebSocket
                    console.log(`[${monitorId}] Successfully obtained socket object after delay.`);

                    // Add the socket to the status clients
                    statusClients.add(socket);

            // Send initial status
            const statusData = {
                activeCalls: Array.from(callLogs.entries()).map(([callSid, logs]) => ({
                    callSid,
                            logs: logs.slice(-10),
                    active: activeWebSockets.has(callSid)
                }))
            };

                    if (socket.readyState === WebSocket.OPEN) {
                        try {
                            socket.send(JSON.stringify(statusData));
                            console.log(`[${monitorId}] Sent initial status data to client`);
                        } catch (err) {
                            console.error(`[${monitorId}] Error sending initial status:, err.message`);
                        }
                    } else {
                        console.warn(`[${monitorId}] Socket not open when trying to send initial status (State: ${socket.readyState})`);
            }

            // Handle errors
                    socket.on('error', (error) => {
                        console.error(`[${monitorId}] Status monitor WebSocket error:, error.message`);
                        statusClients.delete(socket);
                    });

                    socket.on('close', (code, reason) => {
                        console.log(`[${monitorId}] Status monitor client disconnected (Code: ${code}, Reason: ${reason})`);
                        statusClients.delete(socket);
                    });

                    // Ping the client every 15 seconds
            const pingInterval = setInterval(() => {
                        if (socket.readyState === WebSocket.OPEN) {
                    try {
                                socket.send(JSON.stringify({ type: 'ping', timestamp: new Date().toISOString() }));
                    } catch (error) {
                                console.error(`[${monitorId}] Error sending ping:, error.message`);
                        clearInterval(pingInterval);
                    }
                } else {
                            console.log(`[${monitorId}] Ping - socket not open (State: ${socket.readyState}), clearing interval`);
                    clearInterval(pingInterval);
                }
            }, 15000);

            // Clean up interval when connection closes
                    // Need a separate handler as the outer 'close' might fire too late
                    const closeHandler = () => {
                        console.log(`[${monitorId}] Cleaning up ping interval on close (via closeHandler)`);
                clearInterval(pingInterval);
                    };
                    socket.on('close', closeHandler);

                } else {
                    console.error(`[${monitorId}] Failed to obtain a valid WebSocket object from the connection even after delay.`);
                    console.log(`Request headers: ${JSON.stringify(req.headers || {})}`);
                    console.log(`Request URL: ${req.url || 'unknown'}`);
                    console.log(`Is WebSocket upgrade request: ${(req.headers && req.headers.upgrade === 'websocket') || false}`);

                    if(connection && typeof connection.close === 'function') {
                        try { connection.close(); } catch(e) {}
                    }
                    return;
                }
        } catch (error) {
                console.error(`[${monitorId}] Error in status monitor setup after delay:, error.message`);
                console.error(error.stack);
                if (socket && typeof socket.close === 'function') {
                    try {
                        socket.close(1011, 'Internal Server Error');
                    } catch (err) {
                        console.error(`[${monitorId}] Error closing socket after error:, err.message`);
                    }
                }
            }
        }, 200); // Increase delay from 50ms to 200ms
    });
});

// Function to broadcast status updates
function broadcastStatus(callSid, message) {
    try {
        if (!callSid) {
            console.warn('Attempted to broadcast status with no callSid');
            return;
        }

        // Store log message
        if (!callLogs.has(callSid)) {
            callLogs.set(callSid, []);
        }

        const timestamp = new Date().toISOString();
        const logEntry = { timestamp, message };
        callLogs.get(callSid).push(logEntry);

        // Keep only last 100 messages per call
        if (callLogs.get(callSid).length > 100) {
            callLogs.get(callSid).shift();
        }

        // Log to console as well
        console.log(`[${callSid}] ${message}`);

        // Broadcast to all status clients
        const statusUpdate = {
            type: 'update',
            callSid,
            log: logEntry,
            active: activeWebSockets.has(callSid)
        };

        const deadClients = new Set();

        // Only proceed if there are clients to broadcast to
        if (statusClients.size === 0) {
            return;
        }

        for (const client of statusClients) {
            try {
                if (client && typeof client.readyState !== 'undefined' && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(statusUpdate));
                } else if (!client || typeof client.readyState === 'undefined' || client.readyState === WebSocket.CLOSED || client.readyState === WebSocket.CLOSING) {
                    deadClients.add(client);
                }
            } catch (error) {
                console.error('Error sending status update to client:', error);
                deadClients.add(client);
            }
        }

        // Clean up dead clients
        for (const client of deadClients) {
            statusClients.delete(client);
        }
    } catch (error) {
        console.error('Error in broadcastStatus:', error);
    }
}

// Endpoint to initiate an outbound call
fastify.post('/call', async (request, reply) => {
  const { phoneNumberTo, promptText } = request.body;

  if (!phoneNumberTo) {
    return reply.code(400).send({ error: 'Phone number is required' });
  }

  // Check if the number is allowed to be called
  const allowed = await isNumberAllowed(phoneNumberTo);
  if (!allowed) {
    return reply.code(403).send({ error: 'Phone number is not allowed to be called' });
  }

  try {
    // Initiate the call using Twilio
    const call = await client.calls.create({
      url: `https://${DOMAIN}/twiml`,
      to: phoneNumberTo,
      from: PHONE_NUMBER_FROM,
    });

    // Store the prompt for this call
    if (promptText) {
      activeWebSockets.set(call.sid, { prompt: promptText });
    }

    return {
      message: 'Call initiated successfully',
      callSid: call.sid
    };
  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: 'Failed to initiate call' });
  }
});

// Function to generate outboundTwML (Now accepts language)
function generateTwiML(language) {
  const streamUrl = `wss://${DOMAIN}/media-stream`;
  // Remove the <Say> verb
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}">
      <Parameter name="callSid" value="{{CallSid}}"/>
      <Parameter name="language" value="${language}"/>
    </Stream>
  </Connect>
</Response>`;
}

// Generate TwiML for the call (Reads language from query)
fastify.post('/twiml', async (request, reply) => {
  console.log('>>> TwiML endpoint hit <<<');
  try {
    console.log('TwiML Request Body:', request.body);
    console.log('TwiML Request Query:', request.query); // Log query parameters

    // Extract the callSid from the Twilio request for logging
    const callSid = request.body?.CallSid;
    // Extract the language from the query parameter
    const language = request.query?.language || 'en-US'; // Default to en-US if not provided
    console.log(`TwiML requested for call: ${callSid || 'Unknown'}, Language: ${language}`);

    // Generate TwiML, passing the language
    const twiml = generateTwiML(language);
    console.log(`Generated TwiML: ${twiml}`);

  reply.header('Content-Type', 'text/xml');
    return twiml;
  } catch (error) {
    console.error('!!! Error in /twiml endpoint:', error);
    reply.status(500).send('Error generating TwiML');
  }
});

// Endpoint to check call status
fastify.get('/status/:callSid', async (request, reply) => {
  const { callSid } = request.params;

  if (!callSid) {
    return reply.code(400).send({ error: 'Call SID is required' });
  }

  try {
    const call = await client.calls(callSid).fetch();
    return {
      callSid: call.sid,
      status: call.status,
      direction: call.direction,
      from: call.from,
      to: call.to,
      duration: call.duration,
      startTime: call.startTime,
      endTime: call.endTime
    };
  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: 'Failed to retrieve call status' });
  }
});

// Call status callback endpoint
fastify.post('/call-status', async (request, reply) => {
  console.log('\n\n=== CALL STATUS WEBHOOK HIT ===');
  console.log('Headers:', JSON.stringify(request.headers, null, 2));
  console.log('Raw body:', request.raw.body);
  console.log('Parsed body:', request.body);

  try {
    const callStatus = request.body;
    console.log('Call status update received:', JSON.stringify(callStatus, null, 2));

    const callSid = callStatus?.CallSid;
    const status = callStatus?.CallStatus;

    if (!callSid) {
      console.error('No CallSid in status update!');
      return reply.status(400).send('Missing CallSid');
    }

    if (!status) {
      console.error('No CallStatus in status update!');
      return reply.status(400).send('Missing CallStatus');
    }

    console.log(`[${callSid}] Status changed to: ${status}`);
    console.log(`[${callSid}] Current transcript exists:, callTranscripts.has(callSid)`);
    if (callTranscripts.has(callSid)) {
      console.log(`[${callSid}] Current transcript length:, callTranscripts.get(callSid).length`);
      console.log(`[${callSid}] Current transcript content:, JSON.stringify(callTranscripts.get(callSid), null, 2)`);
    }

    broadcastStatus(callSid, `Call status: ${status}`);

    // If a call is completed or failed, clean up its resources
    if (['completed', 'failed', 'busy', 'no-answer'].includes(status)) {
      console.log(`\n[${callSid}] Call ended with status ${status}. Starting cleanup...`);

      if (activeWebSockets.has(callSid)) {
        console.log(`[${callSid}] Found active WebSocket, closing...`);
        const socket = activeWebSockets.get(callSid);
        if (socket && socket.readyState === WebSocket.OPEN) {
          try {
            socket.close(1000, 'Call ended');
            console.log(`[${callSid}] WebSocket closed successfully`);
          } catch(e) {
            console.error(`[${callSid}] Error closing Twilio socket:, e.message`);
          }
        }
        activeWebSockets.delete(callSid);
        console.log(`[${callSid}] Removed from activeWebSockets`);
      }

      if (callLogs.has(callSid)) {
        console.log(`[${callSid}] Found call logs, removing...`);
        callLogs.delete(callSid);
        console.log(`[${callSid}] Call logs removed`);
      }

              // ─── Send transcript to n8n ────────────────────────────────
        if (callTranscripts.has(callSid)) {
          console.log(`\n[${callSid}] Found transcript to send to n8n`);
          const rawTranscript = callTranscripts.get(callSid);
          console.log(`[${callSid}] Raw transcript entries:, JSON.stringify(rawTranscript, null, 2)`);

          const transcript = rawTranscript
            .filter(x => x.role !== 'separator')
            .map(x => `${x.role === 'user' ? 'User' : 'Assistant'}: ${x.text}`)
            .join('\n');

          console.log(`[${callSid}] Prepared transcript for n8n:, transcript`);
          console.log(`[${callSid}] N8N_WEBHOOK_URL:, process.env.N8N_WEBHOOK_URL`);

        try {
          console.log(`[${callSid}] Attempting to send transcript to n8n...`);
          const response = await fetch(process.env.N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              callSid,
              transcript,
              destinations: [] // We'll add destinations later if needed
            })
          });

          console.log(`[${callSid}] n8n response status:, response.status`);
          const responseText = await response.text();
          console.log(`[${callSid}] n8n response body:, responseText`);

          console.log(`[${callSid}] Transcript pushed to n8n successfully`);
        } catch (err) {
          console.error(`[${callSid}] Failed to push transcript:, err.message`);
          console.error(`[${callSid}] Error stack:, err.stack`);
        }

        callTranscripts.delete(callSid);
        console.log(`[${callSid}] Removed call transcript`);
      } else {
        console.log(`[${callSid}] No transcript found to send to n8n`);
      }



      // Clean up metadata
      if (callMetadata.has(callSid)) {
        callMetadata.delete(callSid);
        console.log(`[${callSid}] Removed call metadata`);
      }

      console.log(`[${callSid}] Cleanup completed\n`);
    }

    // Twilio expects a 200 OK or 204 No Content
    reply.status(204).send();
  } catch (error) {
    console.error('!!! Error in /call-status endpoint:', error.message);
    console.error('Error stack:', error.stack);
    reply.status(500).send();
  }
});

// Store call metadata for context
const callMetadata = new Map();

// API endpoint to handle call requests from Netlify landing page
fastify.post('/make-call', async (request, reply) => {
  console.log('>>> /make-call endpoint hit <<<');
  try {
    // Set CORS headers
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type');

    // Parse request body
    console.log('Raw request body:', request.body);
    const { phoneNumber, language, metadata } = request.body;

    if (!phoneNumber) {
      console.log('Error: Phone number is missing');
      return reply.code(400).send({
        success: false,
        message: 'Phone number is required'
      });
    }

    const effectiveLanguage = language || 'en-US'; // Default language if not provided
    console.log(`Received call request for: ${phoneNumber}, language: ${effectiveLanguage}`);
    console.log('Metadata received:', JSON.stringify(metadata, null, 2));

    // Send email data to N8N webhook if email is provided and webhook URL is configured
    if (metadata?.email && N8N_EMAIL_WEBHOOK_URL) {
      try {
        console.log(`Sending email data to N8N webhook for: ${metadata.email}`);
        const emailData = {
          email: metadata.email,
          phoneNumber: phoneNumber,
          hotelName: metadata.hotelName || 'Unknown Hotel',
          city: metadata.city || 'Unknown City',
          language: effectiveLanguage,
          guestDetails: metadata.guestDetails || {},
          timestamp: new Date().toISOString(),
          source: 'hotel-concierge-request'
        };

        const emailResponse = await fetch(N8N_EMAIL_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(emailData)
        });

        console.log(`N8N email webhook response status: ${emailResponse.status}`);
        if (emailResponse.ok) {
          console.log('Email data sent to N8N successfully');
        } else {
          console.error('Failed to send email data to N8N:', await emailResponse.text());
        }
      } catch (emailError) {
        console.error('Error sending email data to N8N:', emailError.message);
        // Don't fail the call request if email webhook fails
      }
    }

    // Initiate the call, passing the language
    try {
      const call = await makeCall(phoneNumber, effectiveLanguage);

      if (!call) {
        console.log(`Failed to initiate call to ${phoneNumber} - not allowed or other error`);
        return reply.code(400).send({
          success: false,
          message: 'Could not initiate call, check if the number is allowed'
        });
      }

      console.log(`Successfully initiated call to ${phoneNumber}, SID: ${call.sid}`);

      // Store metadata for this call
      if (metadata) {
        callMetadata.set(call.sid, metadata);
        console.log(`Stored metadata for call ${call.sid}:, JSON.stringify(metadata, null, 2)`);
      }

      return {
        success: true,
        message: 'Call initiated successfully',
        callSid: call.sid
      };
    } catch (callError) {
      console.error(`Error making call to ${phoneNumber}:, callError`);
      return reply.code(500).send({
        success: false,
        message: `Error making call: ${callError.message}`
      });
    }
  } catch (error) {
    console.error('!!! Error in /make-call endpoint:', error.message);
    return reply.code(500).send({
      success: false,
      message: 'Error initiating call: ' + error.message
    });
  }
});

// Simple test endpoint to verify API is working
fastify.get('/test', async (request, reply) => {
  console.log('>>> /test endpoint hit <<<');
  reply.header('Access-Control-Allow-Origin', '*');
  return {
    success: true,
    message: 'API is working!',
    timestamp: new Date().toISOString()
  };
});

// Handle preflight CORS requests
fastify.options('/make-call', async (request, reply) => {
  // Set CORS headers
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type');

  return reply.code(204).send();
});

// Initialize server
fastify.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
    if (err) {
        console.error('Error starting server:', err);
        process.exit(1);
    }
    console.log(`Server is listening on port ${PORT}`);

    // Parse command-line arguments to get the phone number
    const args = process.argv.slice(2);
    const phoneNumberArg = args.find(arg => arg.startsWith('--call='));

    if (phoneNumberArg) {
        // If --call argument is provided, initiate the call
    console.log(
        'Our recommendation is to always disclose the use of AI for outbound or inbound calls.\n'+
        'Reminder: all of the rules of TCPA apply even if a call is made by AI \n' +
        'Check with your counsel for legal and compliance advice.'
    );
    const phoneNumberToCall = phoneNumberArg.split('=')[1].trim();
        console.log('Initiating call to ', phoneNumberToCall);
        makeCall(phoneNumberToCall).catch(err => {
            console.error('Error initiating call from command line:', err);
        });
    } else {
        // If no --call argument, just keep the server running to handle API requests.
        console.log('Server started without initiating an automatic call. Ready to receive API requests.');
    }
});