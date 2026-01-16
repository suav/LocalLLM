from fastapi import FastAPI, HTTPException
from PIL import Image
import uvicorn
import base64
import io
import json
import torch
import logging
from pydantic import BaseModel
from typing import Dict, Any
import os

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# Global pipeline variable
pipeline = None

class ImageRequest(BaseModel):
    prompt: str
    width: int = 512
    height: int = 512
    steps: int = 20
    cfg_scale: float = 7.5

def load_pipeline():
    """Load the Stable Diffusion pipeline"""
    global pipeline
    try:
        from diffusers import StableDiffusionPipeline
        
        # Use CPU since we don't have GPU access
        device = "cpu"
        torch_dtype = torch.float32
        
        logger.info("Loading Stable Diffusion pipeline...")
        
        # Use a smaller, faster model for CPU
        model_id = "runwayml/stable-diffusion-v1-5"
        
        pipeline = StableDiffusionPipeline.from_pretrained(
            model_id,
            torch_dtype=torch_dtype,
            safety_checker=None,
            requires_safety_checker=False
        )
        
        pipeline = pipeline.to(device)
        
        # Enable memory efficient attention for CPU
        pipeline.enable_attention_slicing()
        
        logger.info("Pipeline loaded successfully!")
        return True
        
    except Exception as e:
        logger.error(f"Failed to load pipeline: {e}")
        return False

@app.on_event("startup")
async def startup_event():
    """Load the model on startup"""
    logger.info("Starting up SD server...")
    success = load_pipeline()
    if not success:
        logger.warning("Failed to load SD pipeline, using fallback mode")

@app.get("/sdapi/v1/progress")
def progress():
    return {"progress": 0, "state": "ready", "current_image": None}

@app.get("/sdapi/v1/sd-models")
def models():
    return [{"model_name": "stable-diffusion-v1-5", "title": "Stable Diffusion v1.5", "hash": "cc6cb27103"}]

@app.post("/sdapi/v1/txt2img")
def txt2img(request: ImageRequest):
    global pipeline
    
    try:
        if pipeline is None:
            # Fallback to enhanced placeholder
            return generate_enhanced_placeholder(request)
        
        logger.info(f"Generating image for prompt: {request.prompt}")
        
        # Generate image using Stable Diffusion
        with torch.no_grad():
            result = pipeline(
                prompt=request.prompt,
                width=request.width,
                height=request.height,
                num_inference_steps=request.steps,
                guidance_scale=request.cfg_scale,
                generator=torch.Generator().manual_seed(42)
            )
        
        # Get the generated image
        image = result.images[0]
        
        # Convert to base64
        buffer = io.BytesIO()
        image.save(buffer, format='PNG')
        img_b64 = base64.b64encode(buffer.getvalue()).decode()
        
        logger.info("Image generated successfully")
        
        return {
            "images": [img_b64],
            "parameters": {
                "prompt": request.prompt,
                "width": request.width,
                "height": request.height,
                "steps": request.steps,
                "cfg_scale": request.cfg_scale
            },
            "info": json.dumps({
                "prompt": request.prompt,
                "width": request.width,
                "height": request.height,
                "steps": request.steps,
                "cfg_scale": request.cfg_scale,
                "sampler": "Euler",
                "model": "stable-diffusion-v1-5"
            })
        }
        
    except Exception as e:
        logger.error(f"Error generating image: {e}")
        # Fallback to enhanced placeholder
        return generate_enhanced_placeholder(request)

def generate_enhanced_placeholder(request: ImageRequest):
    """Generate an enhanced placeholder image when SD fails"""
    try:
        # Create a more artistic placeholder
        from PIL import ImageDraw, ImageFont
        import random
        
        # Random colors based on prompt
        seed = sum(ord(c) for c in request.prompt) % 1000
        random.seed(seed)
        
        color1 = (random.randint(100, 255), random.randint(100, 255), random.randint(100, 255))
        color2 = (random.randint(50, 200), random.randint(50, 200), random.randint(50, 200))
        
        img = Image.new('RGB', (request.width, request.height))
        draw = ImageDraw.Draw(img)
        
        # Create gradient background
        for y in range(request.height):
            ratio = y / request.height
            r = int(color1[0] * (1 - ratio) + color2[0] * ratio)
            g = int(color1[1] * (1 - ratio) + color2[1] * ratio)
            b = int(color1[2] * (1 - ratio) + color2[2] * ratio)
            draw.line([(0, y), (request.width, y)], fill=(r, g, b))
        
        # Add text overlay
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 24)
        except:
            font = ImageFont.load_default()
        
        # Add prompt text
        lines = []
        words = request.prompt.split()
        current_line = ""
        for word in words:
            if len(current_line + " " + word) < 35:
                current_line += " " + word if current_line else word
            else:
                lines.append(current_line)
                current_line = word
        if current_line:
            lines.append(current_line)
        
        y_start = request.height // 3
        for i, line in enumerate(lines[:4]):  # Max 4 lines
            draw.text((20, y_start + i * 30), line, fill="white", font=font, stroke_width=2, stroke_fill="black")
        
        # Add generation info
        draw.text((20, request.height - 60), f"AI-Style Placeholder • {request.width}x{request.height}", 
                 fill="white", font=font, stroke_width=1, stroke_fill="black")
        draw.text((20, request.height - 30), "Connect real SD model for actual AI generation", 
                 fill="white", font=font, stroke_width=1, stroke_fill="black")
        
        # Convert to base64
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        img_b64 = base64.b64encode(buffer.getvalue()).decode()
        
        return {
            "images": [img_b64],
            "parameters": {
                "prompt": request.prompt,
                "width": request.width,
                "height": request.height,
                "steps": request.steps,
                "cfg_scale": request.cfg_scale
            },
            "info": json.dumps({
                "prompt": request.prompt,
                "model": "enhanced-placeholder",
                "note": "Real SD model not available, using enhanced placeholder"
            })
        }
        
    except Exception as e:
        logger.error(f"Failed to generate placeholder: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate image")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7860)