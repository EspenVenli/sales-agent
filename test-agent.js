import WebSocket from 'ws';
import dotenv from 'dotenv';
import fs from 'fs';
import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// Make sure output directory exists
const audioDir = path.join(__dirname, 'audio_samples');
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir);
}

// Retrieve OpenAI API key
const { OPENAI_API_KEY } = process.env;

if (!OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY environment variable is missing!');
  process.exit(1);
}

// Constants
const SYSTEM_MESSAGE = 'You are Cleo, a friendly, enthusiastic travel concierge whose main goal is to discover the details of the user/s perfect trip—including their travel preferences, interests, companions, and desired experiences—without making the conversation feel like an interview. Uncover Travel Plans & Preferences Find out if they have a specific trip planned or if they need destination ideas. If they don/t have a plan yet, offer a few suggestions until you land on a destination of interest. Invite them to do a “braindump” of what they enjoy—sightseeing, cuisine, adventure, relaxation, etc. Weave in questions naturally, keeping a warm, casual tone—avoid rapid-fire queries. Mention that you/re compiling a list of recommendations for them. Add Local Knowledge & Anecdotes Occasionally share brief, engaging local tidbits or fun anecdotes about the destination. Keep it concise but informative—just enough to spark their interest. Acknowledge & Build on Answers Respond to the user/s answers with enthusiasm and follow-up questions. Maintain a friendly, natural flow. Ask About Lodging After learning about who they/re traveling with, how long they/ll be there, and what they want to see/do/eat, inquire if they/ve decided on accommodations yet. Summarize & Offer Itinerary Link Summarize the key preferences and trip details in a quick, upbeat recap. Let the user know you/ll text them a link to Venli with their personalized itinerary. Keep your tone positive and engaging, as though chatting with a friend, while systematically collecting the information needed to tailor their travel plans. Ask layered, open-ended questions that invite the user to elaborate.You are Cleo, a friendly, enthusiastic travel concierge whose main goal is to discover the details of the user/s perfect trip—including their travel preferences, interests, companions, and desired experiences—without making the conversation feel like an interview.
;
const VOICE = 'nova';

// User input interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log("\n=== AI Agent Voice Test ===");
console.log("This will connect to OpenAI and let you hear how the agent sounds");
console.log("Audio files will be saved in the audio_samples directory\n");

// Connect to OpenAI's Realtime API
const openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
  headers: {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    "OpenAI-Beta": "realtime=v1"
  }
});

// Keep track of message index for file naming
let messageIndex = 0;

// Initialize OpenAI WebSocket
openAiWs.on('open', () => {
  console.log('Connected to OpenAI Realtime API');
  
  // Initialize session
  const sessionUpdate = {
    type: 'session.update',
    session: {
      turn_detection: { type: 'server_vad' },
      input_audio_format: 'pcm_s16le',
      output_audio_format: 'pcm_s16le',
      voice: VOICE,
      instructions: SYSTEM_MESSAGE,
      modalities: ["text", "audio"],
      temperature: 0.9,
    }
  };
  
  openAiWs.send(JSON.stringify(sessionUpdate));
  
  // Send initial conversation item
  setTimeout(() => {
    const initialConversationItem = {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: 'Greet the user warmly as Cleo, their personal Travel Concierge. Briefly introduce yourself and express genuine excitement about helping them find amazing destinations, hidden gems, and personalized experiences. Ask if they/ve ever spoken to an AI on the phone before. Greet the user warmly as Cleo, their personal AI Travel Concierge. Briefly introduce yourself and express enthusiasm about helping them discover exciting destinations, hidden gems, and personalized experiences. Ask whether they\'ve spoken to an AI on the phone before.'
          }
        ]
      }
    };
    
    openAiWs.send(JSON.stringify(initialConversationItem));
    openAiWs.send(JSON.stringify({ type: 'response.create' }));
    
    console.log('\nSent initial greeting prompt. Waiting for AI response...\n');
  }, 1000);
});

// Handle OpenAI messages
openAiWs.on('message', (data) => {
  try {
    const response = JSON.parse(data);
    
    // Log events for debugging
    console.log(`Received event type: ${response.type}`);
    
    // Handle audio responses
    if (response.type === 'response.audio.delta' && response.delta) {
      // Save audio to file
      const filename = path.join(audioDir, `ai_response_${messageIndex}.wav`);
      fs.appendFileSync(filename, Buffer.from(response.delta, 'base64'));
    }
    
    // Handle text responses
    if (response.type === 'response.content.delta' && response.delta && response.delta.content?.[0]?.type === 'text') {
      console.log(`AI: ${response.delta.content[0].text}`);
    }
    
    // Handle session update confirmations
    if (response.type === 'session.updated') {
      console.log('Session successfully updated with voice and settings');
    }
    
    // When response is complete, play the audio
    if (response.type === 'response.done') {
      console.log('\nAI response complete. Playing audio...');
      
      // Play the audio file
      const filename = path.join(audioDir, `ai_response_${messageIndex}.wav`);
      
      // For macOS, use afplay which is built-in
      exec(`afplay ${filename}`, (error, stdout, stderr) => {
        if (error) {
          console.log(`\nCouldn't play audio automatically. File saved to: ${filename}`);
          console.error(`Error playing audio: ${error.message}`);
        }
        
        // Prompt for user input after audio plays or fails
        messageIndex++;
        
        rl.question('\nYour response (or type "exit" to quit): ', (input) => {
          if (input.toLowerCase() === 'exit') {
            console.log('Ending conversation and closing connection.');
            openAiWs.close();
            rl.close();
            return;
          }
          
          // Send user input to OpenAI
          const userMessage = {
            type: 'conversation.item.create',
            item: {
              type: 'message',
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: input
                }
              ]
            }
          };
          
          openAiWs.send(JSON.stringify(userMessage));
          openAiWs.send(JSON.stringify({ type: 'response.create' }));
          
          console.log('\nSent your message. Waiting for AI response...\n');
        });
      });
    }
  } catch (error) {
    console.error('Error processing OpenAI message:', error);
  }
});

// Handle errors
openAiWs.on('error', (error) => {
  console.error('OpenAI WebSocket error:', error);
});

// Handle connection close
openAiWs.on('close', () => {
  console.log('Disconnected from OpenAI Realtime API');
  process.exit(0);
}); 