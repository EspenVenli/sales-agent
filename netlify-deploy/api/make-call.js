// This file serves as an adapter between our web interface and the Twilio-based call system
// It will make an HTTP request to our call system API

exports.handler = async function(event, context) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
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
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify({ success: false, message: 'Invalid request body' })
    };
  }

  // Extract form data
  const { 
    phoneNumber, 
    hotelName,
    email, 
    knowDates, 
    guestDetails,
    language 
  } = data;
  
  if (!phoneNumber) {
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify({ success: false, message: 'Phone number is required' })
    };
  }

  // Prepare the request payload for the backend
  const backendPayload = {
    phoneNumber,
    language: language || 'en-US',
    metadata: {
      hotelName: hotelName || null,
      email: email || null,
      knowDates: knowDates || 'no',
      guestDetails: guestDetails || null,
      source: 'netlify-frontend',
      timestamp: new Date().toISOString()
    }
  };

  // Forward the request to our Twilio service
  try {
    console.log('Forwarding request to backend:', JSON.stringify(backendPayload, null, 2));
    
    const response = await fetch('https://hotelagent.onrender.com/make-call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(backendPayload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Backend responded with status: ${response.status}, body: ${errorText}`);
      throw new Error(`Server responded with status: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('Backend response:', JSON.stringify(result, null, 2));
    
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error('Error forwarding call request:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify({ 
        success: false, 
        message: 'Failed to forward call request: ' + error.message 
      })
    };
  }
}; 