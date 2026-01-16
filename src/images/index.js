const axios = require('axios');
const sharp = require('sharp');
const config = require('../config');
const { saveFile } = require('../storage');

// Image generation service integration
// This can be extended to support multiple providers (DALL-E, Midjourney, Stable Diffusion, etc.)

// Generate filename from prompt
function generatePromptBasedFilename(prompt) {
  // Take first 3-4 words, clean them up, and create a filename
  const words = prompt
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove special characters
    .split(/\s+/) // Split on whitespace
    .filter(word => word.length > 2) // Filter out short words like "a", "of", "the"
    .slice(0, 3); // Take first 3 meaningful words
  
  const baseFilename = words.join('_') || 'image';
  const timestamp = Date.now();
  
  return `${baseFilename}_${timestamp}`;
}

// Generate image using available local models
async function generateImage(userId, prompt, options = {}) {
  const {
    model = 'auto', // Auto-detect best available model
    width = 512,
    height = 512,
    quality = 'standard',
    style = 'natural',
    steps = 20,
    guidanceScale = 7.5
  } = options;
  
  try {
    console.log(`Generating image for user ${userId}: "${prompt}"`);
    
    let imageBuffer;
    let usedModel = model;
    
    // Try different generation methods in order of preference
    try {
      // 1. Try Ollama vision models first
      const ollamaResult = await generateWithOllama(prompt, options);
      if (ollamaResult) {
        imageBuffer = ollamaResult.buffer;
        usedModel = ollamaResult.model;
        console.log(`Generated image using Ollama model: ${usedModel}`);
      }
    } catch (ollamaError) {
      console.log('Ollama generation failed:', ollamaError.message);
    }
    
    if (!imageBuffer) {
      try {
        // 2. Try local Stable Diffusion API
        const sdResult = await generateWithStableDiffusion(prompt, options);
        if (sdResult) {
          imageBuffer = sdResult.buffer;
          usedModel = sdResult.model;
          console.log(`Generated image using Stable Diffusion: ${usedModel}`);
        }
      } catch (sdError) {
        console.log('Stable Diffusion generation failed:', sdError.message);
      }
    }
    
    if (!imageBuffer) {
      // 3. Fall back to enhanced placeholder
      console.log('Falling back to enhanced placeholder generation');
      imageBuffer = await generateEnhancedPlaceholder(prompt, width, height, style);
      usedModel = 'placeholder';
    }
    
    // Generate filename based on prompt
    const promptFilename = generatePromptBasedFilename(prompt);
    
    // Save the generated image
    const metadata = await saveFile(
      userId,
      imageBuffer,
      promptFilename,
      'image/png',
      'images'
    );
    
    // Add generation metadata
    metadata.generation = {
      prompt,
      model: usedModel,
      width,
      height,
      quality,
      style,
      steps,
      guidanceScale,
      generatedAt: new Date().toISOString()
    };
    
    return metadata;
  } catch (error) {
    console.error('Error generating image:', error);
    throw new Error('Failed to generate image');
  }
}

// Generate placeholder image with text overlay (temporary implementation)
async function generatePlaceholderImage(prompt, width = 512, height = 512) {
  try {
    // Create a gradient background
    const gradientSvg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#10a37f;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#0d9488;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#grad)" />
        <text x="50%" y="30%" dominant-baseline="middle" text-anchor="middle" 
              fill="white" font-family="Arial" font-size="24" font-weight="bold">
          Generated Image
        </text>
        <text x="50%" y="70%" dominant-baseline="middle" text-anchor="middle" 
              fill="white" font-family="Arial" font-size="14" opacity="0.9">
          ${prompt.length > 50 ? prompt.substring(0, 50) + '...' : prompt}
        </text>
      </svg>
    `;
    
    const imageBuffer = await sharp(Buffer.from(gradientSvg))
      .png()
      .toBuffer();
    
    return imageBuffer;
  } catch (error) {
    console.error('Error creating placeholder image:', error);
    throw error;
  }
}

// Process uploaded image (resize, optimize, etc.)
async function processUploadedImage(imageBuffer, options = {}) {
  const {
    maxWidth = 1920,
    maxHeight = 1080,
    quality = 85,
    format = 'jpeg'
  } = options;
  
  try {
    let processor = sharp(imageBuffer);
    
    // Get image metadata
    const metadata = await processor.metadata();
    
    // Resize if needed
    if (metadata.width > maxWidth || metadata.height > maxHeight) {
      processor = processor.resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true
      });
    }
    
    // Convert and optimize
    if (format === 'jpeg') {
      processor = processor.jpeg({ quality, mozjpeg: true });
    } else if (format === 'png') {
      processor = processor.png({ quality });
    } else if (format === 'webp') {
      processor = processor.webp({ quality });
    }
    
    const processedBuffer = await processor.toBuffer();
    
    return {
      buffer: processedBuffer,
      metadata: {
        originalSize: imageBuffer.length,
        processedSize: processedBuffer.length,
        originalDimensions: { width: metadata.width, height: metadata.height },
        format,
        quality
      }
    };
  } catch (error) {
    console.error('Error processing image:', error);
    throw new Error('Failed to process image');
  }
}

// Integration with external image generation APIs
async function generateWithExternalAPI(prompt, provider = 'openai', options = {}) {
  // This would integrate with external services
  // For now, return placeholder
  throw new Error('External API integration not yet implemented');
  
  // Example implementation structure:
  /*
  switch (provider) {
    case 'openai':
      return await generateWithOpenAI(prompt, options);
    case 'stability':
      return await generateWithStabilityAI(prompt, options);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
  */
}

// Check if local Ollama supports image generation
async function checkOllamaImageSupport() {
  try {
    const response = await axios.get(`${config.OLLAMA_HOST}/api/tags`);
    const models = response.data.models || [];
    
    // Look for vision or image generation capable models
    const imageModels = models.filter(model => 
      model.name.includes('vision') || 
      model.name.includes('imagen') || 
      model.name.includes('dall-e') ||
      model.name.includes('stable-diffusion')
    );
    
    return {
      supported: imageModels.length > 0,
      models: imageModels
    };
  } catch (error) {
    console.error('Error checking Ollama image support:', error);
    return { supported: false, models: [] };
  }
}

// Generate image using Ollama (for models that support image generation)
async function generateWithOllama(prompt, options = {}) {
  try {
    // Check if Ollama has any image generation models
    const imageSupport = await checkOllamaImageSupport();
    if (!imageSupport.supported) {
      throw new Error('No image generation models available in Ollama');
    }
    
    // Use the first available image model
    const model = imageSupport.models[0].name;
    
    const response = await axios.post(`${config.OLLAMA_HOST}/api/generate`, {
      model: model,
      prompt: `Generate an image: ${prompt}`,
      stream: false,
      format: 'json',
      options: {
        width: options.width || 512,
        height: options.height || 512,
        steps: options.steps || 20
      }
    }, {
      timeout: 300000, // 5 minutes timeout
      responseType: 'arraybuffer'
    });
    
    // This would need to be adapted based on Ollama's actual image generation API
    // For now, this is a placeholder structure
    return {
      buffer: Buffer.from(response.data),
      model: model
    };
  } catch (error) {
    throw new Error(`Ollama generation failed: ${error.message}`);
  }
}

// Generate image using local Stable Diffusion API (Automatic1111 WebUI)
async function generateWithStableDiffusion(prompt, options = {}) {
  const {
    width = 512,
    height = 512,
    steps = 20,
    guidanceScale = 7.5,
    style = 'natural'
  } = options;
  
  try {
    // Common Stable Diffusion API endpoints
    const possibleEndpoints = [
      'http://localhost:7860', // Default Automatic1111 WebUI
      'http://localhost:8188', // ComfyUI
      'http://127.0.0.1:7860'
    ];
    
    let apiUrl = null;
    
    // Try to find an active Stable Diffusion API
    for (const endpoint of possibleEndpoints) {
      try {
        await axios.get(`${endpoint}/sdapi/v1/progress`, { timeout: 3000 });
        apiUrl = endpoint;
        console.log(`Found Stable Diffusion API at: ${endpoint}`);
        break;
      } catch (e) {
        // Endpoint not available, try next
      }
    }
    
    if (!apiUrl) {
      throw new Error('No Stable Diffusion API found');
    }
    
    // Enhance prompt based on style
    let enhancedPrompt = prompt;
    switch (style) {
      case 'photographic':
        enhancedPrompt = `${prompt}, photorealistic, high quality, detailed, 8k`;
        break;
      case 'artistic':
        enhancedPrompt = `${prompt}, artistic, beautiful, masterpiece, detailed`;
        break;
      case 'anime':
        enhancedPrompt = `${prompt}, anime style, colorful, detailed`;
        break;
      case 'natural':
      default:
        enhancedPrompt = `${prompt}, natural, realistic, high quality`;
        break;
    }
    
    const payload = {
      prompt: enhancedPrompt,
      width: width,
      height: height,
      steps: steps,
      cfg_scale: guidanceScale
    };
    
    console.log(`Generating with SD API: ${enhancedPrompt}`);
    
    const response = await axios.post(`${apiUrl}/sdapi/v1/txt2img`, payload, {
      timeout: 300000, // 5 minutes timeout
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (response.data && response.data.images && response.data.images.length > 0) {
      const base64Image = response.data.images[0];
      const imageBuffer = Buffer.from(base64Image, 'base64');
      
      return {
        buffer: imageBuffer,
        model: 'stable-diffusion-webui'
      };
    } else {
      throw new Error('No image returned from Stable Diffusion API');
    }
    
  } catch (error) {
    throw new Error(`Stable Diffusion generation failed: ${error.message}`);
  }
}

// Enhanced placeholder with better styling
async function generateEnhancedPlaceholder(prompt, width = 512, height = 512, style = 'natural') {
  try {
    console.log(`Creating enhanced placeholder: ${width}x${height}, style: ${style}`);
    
    // Generate colors based on style
    let gradientColors = ['#10a37f', '#0d9488']; // Default green
    
    switch (style) {
      case 'photographic':
        gradientColors = ['#4f46e5', '#7c3aed'];
        break;
      case 'artistic':
        gradientColors = ['#f59e0b', '#f97316'];
        break;
      case 'anime':
        gradientColors = ['#ec4899', '#8b5cf6'];
        break;
    }
    
    const truncatedPrompt = prompt.length > 60 ? prompt.substring(0, 60) + '...' : prompt;
    
    // Simpler SVG without foreignObject for better compatibility
    const gradientSvg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${gradientColors[0]};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${gradientColors[1]};stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#grad)" />
        <rect x="25" y="25" width="${width-50}" height="${height-50}" fill="none" stroke="white" stroke-width="3" stroke-opacity="0.4" rx="15"/>
        
        <text x="${width/2}" y="${height*0.3}" text-anchor="middle" 
              fill="white" font-family="Arial, sans-serif" font-size="24" font-weight="bold">
          🎨 AI Generated
        </text>
        
        <text x="${width/2}" y="${height*0.5}" text-anchor="middle" 
              fill="white" font-family="Arial, sans-serif" font-size="16" opacity="0.9">
          ${truncatedPrompt}
        </text>
        
        <text x="${width/2}" y="${height*0.7}" text-anchor="middle" 
              fill="white" font-family="Arial, sans-serif" font-size="14" opacity="0.8">
          Style: ${style} | ${width}×${height}
        </text>
        
        <text x="${width/2}" y="${height*0.8}" text-anchor="middle" 
              fill="white" font-family="Arial, sans-serif" font-size="12" opacity="0.6">
          Connect Stable Diffusion for real AI generation
        </text>
        
        <text x="${width/2}" y="${height*0.9}" text-anchor="middle" 
              fill="white" font-family="Arial, sans-serif" font-size="10" opacity="0.5">
          Generated at ${new Date().toLocaleTimeString()}
        </text>
      </svg>
    `;
    
    console.log('Converting SVG to PNG...');
    const imageBuffer = await sharp(Buffer.from(gradientSvg))
      .png({
        quality: 80,
        compressionLevel: 1,  // Faster compression
        progressive: false
      })
      .toBuffer();
    
    console.log(`Generated placeholder image: ${imageBuffer.length} bytes`);
    return imageBuffer;
  } catch (error) {
    console.error('Error creating enhanced placeholder:', error);
    // Fall back to simple placeholder
    return generatePlaceholderImage(prompt, width, height);
  }
}

// Get available image generation models
async function getAvailableImageModels() {
  const models = [];
  
  try {
    // Check Ollama models
    const ollamaSupport = await checkOllamaImageSupport();
    if (ollamaSupport.supported) {
      models.push(...ollamaSupport.models.map(m => ({
        id: m.name,
        name: m.name,
        provider: 'ollama',
        type: 'local'
      })));
    }
  } catch (error) {
    console.log('Error checking Ollama models:', error.message);
  }
  
  try {
    // Check Stable Diffusion API
    const response = await axios.get('http://localhost:7860/sdapi/v1/sd-models', { timeout: 3000 });
    if (response.data && Array.isArray(response.data)) {
      models.push(...response.data.map(m => ({
        id: m.model_name || m.title,
        name: m.model_name || m.title,
        provider: 'stable-diffusion',
        type: 'local'
      })));
    }
  } catch (error) {
    console.log('No Stable Diffusion API found');
  }
  
  // Always include placeholder as fallback
  models.push({
    id: 'placeholder',
    name: 'Enhanced Placeholder',
    provider: 'builtin',
    type: 'fallback'
  });
  
  return models;
}

module.exports = {
  generateImage,
  processUploadedImage,
  generateWithExternalAPI,
  checkOllamaImageSupport,
  generatePlaceholderImage,
  generateWithOllama,
  generateWithStableDiffusion,
  generateEnhancedPlaceholder,
  getAvailableImageModels
};