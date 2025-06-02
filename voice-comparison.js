import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { exec } from 'child_process';
import readline from 'readline';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const { OPENAI_API_KEY } = process.env;

if (!OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY environment variable is missing!');
  process.exit(1);
}

// Directory for audio files
const audioDir = path.join(__dirname, 'audio_samples');
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir);
}

// Available voices
const voices = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse'];

// Sample texts for different personas
const personas = {
  'Travel Concierge': "Greet the user with EXTREME enthusiasm as Cleo, their personal AI Travel Concierge. Express how EXCITED you are to help them discover AMAZING destinations and create UNFORGETTABLE travel experiences. Use energetic language, vocal variety, and enthusiasm in your voice. Ask if they have had a phone call with an AI before?",
  
  'Watch Sales Rep': "Hey there! I'm Alex from TimeKeeper Watches, and I'm super excited to tell you about our AMAZING new collection! These watches are absolutely stunning - truly works of art for your wrist! We're offering an exclusive 20% discount that ends TODAY for first-time buyers! These timepieces are flying off the shelves - can I take just two minutes to tell you about these incredible watches?",
  
  'Customer Service': "Hi there! This is Jamie from customer support, and I'm absolutely delighted to follow up on your recent inquiry! Your satisfaction means the world to us, and I'm personally committed to making sure you have the most INCREDIBLE experience with our products! I'd love to hear how we can exceed your expectations today!",
  
  'Appointment Reminder': "Hello! I'm calling with an exciting reminder about your appointment tomorrow at 2 PM! We're really looking forward to seeing you! Please arrive just 15 minutes early so we can ensure everything is perfect for you! Is there anything special we can prepare to make your visit absolutely fantastic?"
};

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log("\n=== OpenAI Voice Comparison Tool ===");
console.log("This tool lets you hear how different voices and personas sound\n");

// Display available voices
console.log("Available voices:");
voices.forEach((voice, index) => {
  console.log(`${index + 1}. ${voice}`);
});
console.log();

// Display available personas
console.log("Available personas:");
Object.keys(personas).forEach((persona, index) => {
  console.log(`${index + 1}. ${persona}`);
});
console.log();

// Ask for voice selection
function askForVoice() {
  rl.question('Choose a voice (1-8) or "all" to hear all voices: ', (answer) => {
    if (answer.toLowerCase() === 'all') {
      askForPersona(voices);
    } else {
      const voiceIndex = parseInt(answer) - 1;
      if (voiceIndex >= 0 && voiceIndex < voices.length) {
        askForPersona([voices[voiceIndex]]);
      } else {
        console.log('Invalid choice. Please try again.');
        askForVoice();
      }
    }
  });
}

// Ask for persona selection
function askForPersona(selectedVoices) {
  rl.question('\nChoose a persona (1-4) or "all" to hear all personas: ', (answer) => {
    if (answer.toLowerCase() === 'all') {
      generateForVoicesAndPersonas(selectedVoices, Object.keys(personas));
    } else {
      const personaIndex = parseInt(answer) - 1;
      const personaKeys = Object.keys(personas);
      if (personaIndex >= 0 && personaIndex < personaKeys.length) {
        generateForVoicesAndPersonas(selectedVoices, [personaKeys[personaIndex]]);
      } else {
        console.log('Invalid choice. Please try again.');
        askForPersona(selectedVoices);
      }
    }
  });
}

// Generate speech for selected voices and personas
async function generateForVoicesAndPersonas(selectedVoices, selectedPersonas) {
  console.log('\nGenerating samples...');
  
  // Create an array of promises for each generation
  const audioFiles = [];
  
  for (const voice of selectedVoices) {
    for (const persona of selectedPersonas) {
      const text = personas[persona];
      console.log(`Generating ${voice} as ${persona}...`);
      
      try {
        // Call OpenAI Text-to-Speech API
        const response = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'tts-1',
            voice: voice,
            input: text,
            temperature: 1.0
          })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
        }
        
        // Save the audio to a file
        const audioData = await response.arrayBuffer();
        const filename = `${voice}_${persona.replace(/ /g, '_')}.mp3`;
        const outputFile = path.join(audioDir, filename);
        fs.writeFileSync(outputFile, Buffer.from(audioData));
        
        audioFiles.push({ voice, persona, file: outputFile });
        console.log(`✓ ${filename} generated`);
      } catch (error) {
        console.error(`Error generating ${voice} as ${persona}:`, error.message);
      }
    }
  }
  
  // Play audio files in sequence
  console.log('\nAll samples generated. Playing in sequence...');
  
  playAudioSequentially(audioFiles, 0);
}

// Play audio files one after another
function playAudioSequentially(files, index) {
  if (index >= files.length) {
    console.log('\nAll samples played. Exiting...');
    rl.close();
    return;
  }
  
  const current = files[index];
  console.log(`\nPlaying: ${current.voice} as ${current.persona}`);
  
  exec(`afplay "${current.file}"`, (error) => {
    if (error) {
      console.error(`Error playing audio: ${error.message}`);
      console.log(`You can manually play the file at: ${current.file}`);
    }
    
    // Play the next file after this one finishes
    playAudioSequentially(files, index + 1);
  });
}

// Start the process
askForVoice(); 