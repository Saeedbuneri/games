// Vercel Serverless Function to provide config with environment variables
export default function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  // Return config with environment variable
  res.status(200).json({
    ABLY_API_KEY: process.env.ABLY_API_KEY || ''
  });
}
