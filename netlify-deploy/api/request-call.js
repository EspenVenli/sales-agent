// Netlify Serverless Function to handle call requests
exports.handler = async function(event, context) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, message: 'Method Not Allowed' })
    };
  }

  // Parse request body
  let data;
  try {
    data = JSON.parse(event.body);
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, message: 'Invalid request body' })
    };
  }

  // Extract and validate phone number
  const { phoneNumber, language } = data;
  
  if (!phoneNumber) {
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, message: 'Phone number is required' })
    };
  }

  // Basic phone number validation (E.164 format)
  if (!phoneNumber.startsWith('+') || phoneNumber.length < 8) {
    return {
      statusCode: 400,
      body: JSON.stringify({ 
        success: false, 
        message: 'Phone number must be in E.164 format (e.g., +1XXXXXXXXXX)' 
      })
    };
  }

  try {
    // In a real implementation, you would integrate with your Twilio app
    // Example of how to call your Twilio app with fetch:
    /*
    const response = await fetch('https://your-app-domain/api/make-call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phoneNumber: phoneNumber,
        language: language || 'en-US'
      })
    });

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.message || 'Failed to initiate call');
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Call initiated successfully',
        callSid: result.callSid
      })
    };
    */

    // For demo/development purposes, just return a mock success response
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Call request received',
        callSid: 'CA' + Math.random().toString(36).substring(2, 15)
      })
    };
    
  } catch (error) {
    console.error('Error initiating call:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: 'Failed to initiate call: ' + (error.message || 'Unknown error')
      })
    };
  }
}; 