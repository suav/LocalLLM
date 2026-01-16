// Mock Stable Diffusion API for testing
const express = require('express');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

const app = express();
app.use(express.json());

// Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  next();
});

// Mock model list endpoint
app.get('/sdapi/v1/sd-models', (req, res) => {
  res.json([
    {
      title: "stable-diffusion-v1-5",
      model_name: "v1-5-pruned-emaonly",
      hash: "6ce0161689",
      sha256: "6ce0161689b3853acaa03779ec93eafe75a02f4ced659bee03f50797806fa2fa",
      filename: "/app/models/v1-5-pruned-emaonly.safetensors"
    }
  ]);
});

// Mock progress endpoint
app.get('/sdapi/v1/progress', (req, res) => {
  res.json({
    progress: 0,
    eta_relative: 0,
    state: {
      skipped: false,
      interrupted: false,
      job: "",
      job_count: 0,
      job_timestamp: Date.now(),
      sampling_step: 0,
      sampling_steps: 0
    },
    current_image: null,
    textinfo: null
  });
});

// Mock text-to-image generation
app.post('/sdapi/v1/txt2img', async (req, res) => {
  try {
    const { prompt, width = 512, height = 512, steps = 20, cfg_scale = 7 } = req.body;
    
    console.log(`🎨 Mock SD API: Generating "${prompt}" (${width}x${height})`);
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Create a more sophisticated placeholder
    const colors = {
      'photographic': ['#2563eb', '#7c3aed'],
      'artistic': ['#dc2626', '#ea580c'],
      'anime': ['#ec4899', '#8b5cf6'],
      'natural': ['#059669', '#0d9488']
    };
    
    const style = prompt.toLowerCase().includes('photo') ? 'photographic' :
                  prompt.toLowerCase().includes('art') ? 'artistic' :
                  prompt.toLowerCase().includes('anime') ? 'anime' : 'natural';
    
    const [color1, color2] = colors[style];
    const truncatedPrompt = prompt.length > 40 ? prompt.substring(0, 40) + '...' : prompt;
    
    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${color1};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${color2};stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#grad)" />
        <circle cx="${width/2}" cy="${height/3}" r="50" fill="white" opacity="0.2"/>
        <circle cx="${width/3}" cy="${height*0.7}" r="30" fill="white" opacity="0.15"/>
        <circle cx="${width*0.8}" cy="${height*0.6}" r="40" fill="white" opacity="0.1"/>
        
        <text x="${width/2}" y="${height*0.2}" text-anchor="middle" 
              fill="white" font-family="Arial, sans-serif" font-size="20" font-weight="bold">
          ⚡ Mock Stable Diffusion
        </text>
        
        <text x="${width/2}" y="${height*0.5}" text-anchor="middle" 
              fill="white" font-family="Arial, sans-serif" font-size="14">
          ${truncatedPrompt}
        </text>
        
        <text x="${width/2}" y="${height*0.7}" text-anchor="middle" 
              fill="white" font-family="Arial, sans-serif" font-size="12" opacity="0.8">
          Steps: ${steps} | CFG: ${cfg_scale} | Style: ${style}
        </text>
        
        <text x="${width/2}" y="${height*0.8}" text-anchor="middle" 
              fill="white" font-family="Arial, sans-serif" font-size="10" opacity="0.6">
          Replace with real Stable Diffusion when ready
        </text>
        
        <text x="${width/2}" y="${height*0.9}" text-anchor="middle" 
              fill="white" font-family="Arial, sans-serif" font-size="9" opacity="0.5">
          Mock generated at ${new Date().toLocaleTimeString()}
        </text>
      </svg>
    `;
    
    // Convert SVG to PNG and encode as base64
    const imageBuffer = await sharp(Buffer.from(svg))
      .png()
      .toBuffer();
    
    const base64Image = imageBuffer.toString('base64');
    
    console.log(`✅ Mock SD API: Generated ${imageBuffer.length} bytes for "${prompt}"`);
    
    res.json({
      images: [base64Image],
      parameters: {
        prompt,
        width,
        height,
        steps,
        cfg_scale,
        sampler_index: "DPM++ 2M Karras",
        seed: Math.floor(Math.random() * 1000000)
      },
      info: JSON.stringify({
        prompt,
        all_prompts: [prompt],
        negative_prompt: "",
        seed: Math.floor(Math.random() * 1000000),
        subseed: -1,
        subseed_strength: 0,
        seed_resize_from_h: -1,
        seed_resize_from_w: -1,
        sampler_name: "DPM++ 2M Karras",
        batch_size: 1,
        n_iter: 1,
        steps,
        cfg_scale,
        width,
        height,
        restore_faces: false,
        tiling: false,
        extra_generation_params: {},
        index_of_first_image: 0,
        infotexts: [`${prompt}\\nSteps: ${steps}, Sampler: DPM++ 2M Karras, CFG scale: ${cfg_scale}, Seed: ${Math.floor(Math.random() * 1000000)}, Size: ${width}x${height}, Model hash: 6ce0161689, Model: v1-5-pruned-emaonly`],
        styles: [],
        job_timestamp: Date.now(),
        clip_skip: 1
      })
    });
    
  } catch (error) {
    console.error('Mock SD API error:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = 7860;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Mock Stable Diffusion API running on http://localhost:${PORT}`);
  console.log(`📊 Available endpoints:`);
  console.log(`   GET  /sdapi/v1/sd-models - List models`);
  console.log(`   GET  /sdapi/v1/progress  - Check progress`);
  console.log(`   POST /sdapi/v1/txt2img   - Generate images`);
  console.log(`\n🔄 This will be automatically replaced when real SD is running`);
});