import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { exec } from 'child_process';

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

console.log("\n=== AI Voice Test (Simple Version) ===");
console.log("This will generate a speech sample using OpenAI's API\n");

async function generateAndPlaySpeech() {
  try {
    const text = "Hello! I'm Cleo, your personal AI Travel Concierge. I'm excited to help you discover amazing destinations, hidden gems, and tailor experiences just for you. Have you spoken with an AI on the phone before? I'd love to know what kind of travel experiences you're interested in.";
    
    console.log(`Generating speech for text: "${text}"`);
    console.log("Using voice: nova");
    
    // Call OpenAI Text-to-Speech API
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice: 'nova',
        input: text
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }
    
    // Save the audio to a file
    const audioData = await response.arrayBuffer();
    const outputFile = path.join(audioDir, 'sample_speech.mp3');
    fs.writeFileSync(outputFile, Buffer.from(audioData));
    
    console.log(`\nSpeech generated successfully. Saved to: ${outputFile}`);
    console.log('Playing audio...');
    
    // Play the audio
    exec(`afplay ${outputFile}`, (error) => {
      if (error) {
        console.error(`Error playing audio: ${error.message}`);
        console.log(`You can manually play the file at: ${outputFile}`);
      } else {
        console.log('\nAudio played successfully!');
      }
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run the function
generateAndPlaySpeech(); 