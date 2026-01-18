from fastapi import FastAPI, HTTPException
from PIL import Image
import uvicorn
import base64
import io
import json
import torch
import logging
from pydantic import BaseModel
from typing import Dict, Any, List
import os
import glob

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# Global variables
pipeline = None
current_model = None
available_models = {}

class ImageRequest(BaseModel):
    prompt: str
    negative_prompt: str = ""
    width: int = 512
    height: int = 512
    steps: int = 20
    cfg_scale: float = 7.5
    seed: int = -1  # -1 means random seed

class ModelSwitchRequest(BaseModel):
    model_name: str

def discover_models():
    """Discover available SD models in the models directory"""
    global available_models
    
    # Default SD 1.5 (always available as it's loaded in the container)
    available_models["stable-diffusion-v1-5"] = {
        "name": "Stable Diffusion v1.5",
        "path": "runwayml/stable-diffusion-v1-5",
        "type": "sd15",
        "description": "Base Stable Diffusion v1.5 model",
        "resolution": "512x512",
        "loaded": True
    }
    
    # SDXL Turbo - Fast SDXL variant optimized for 4GB VRAM
    available_models["sdxl-turbo"] = {
        "name": "SDXL Turbo",
        "path": "stabilityai/sdxl-turbo", 
        "type": "sdxl_turbo",
        "description": "Fast SDXL variant - 4GB GPU optimized",
        "resolution": "512x512",
        "loaded": False
    }
    
    # Look for SDXL models
    sdxl_models = glob.glob("/app/models/sdxl/*.safetensors")
    for model_path in sdxl_models:
        model_name = os.path.basename(model_path).replace('.safetensors', '')
        available_models[model_name] = {
            "name": f"SDXL {model_name}",
            "path": model_path,
            "type": "sdxl",
            "description": "SDXL model (CPU fallback for stability)",
            "resolution": "768x768",  
            "loaded": False
        }
    
    # Look for custom SD 1.5 models
    sd15_models = glob.glob("/app/models/*.safetensors")
    for model_path in sd15_models:
        model_name = os.path.basename(model_path).replace('.safetensors', '')
        if model_name not in available_models:
            available_models[model_name] = {
                "name": f"SD 1.5 {model_name}",
                "path": model_path,
                "type": "sd15",
                "description": "Custom Stable Diffusion v1.5 model",
                "resolution": "512x512",
                "loaded": False
            }
    
    logger.info(f"Discovered {len(available_models)} models: {list(available_models.keys())}")
    return available_models

def check_vram_availability():
    """Check available VRAM and recommend offloading strategy"""
    try:
        if torch.cuda.is_available():
            total_vram = torch.cuda.get_device_properties(0).total_memory / 1024**3
            allocated_vram = torch.cuda.memory_allocated(0) / 1024**3
            reserved_vram = torch.cuda.memory_reserved(0) / 1024**3
            free_vram = total_vram - reserved_vram
            
            logger.info(f"📊 VRAM Status: {allocated_vram:.1f}GB used, {free_vram:.1f}GB free, {total_vram:.1f}GB total")
            
            return {
                "total": total_vram,
                "free": free_vram,
                "allocated": allocated_vram,
                "can_load_sdxl": free_vram >= 3.0,  # Conservative estimate for SDXL
                "should_offload": free_vram < 6.0
            }
    except Exception as e:
        logger.warning(f"Could not check VRAM: {e}")
    
    return {"total": 0, "free": 0, "allocated": 0, "can_load_sdxl": False, "should_offload": True}

def apply_comfyui_style_optimizations(pipeline, model_type: str, vram_info: dict):
    """Apply ComfyUI-style memory optimizations"""
    device = pipeline.device
    
    if device.type == "cuda":
        logger.info("🔧 Applying ComfyUI-style VRAM optimizations...")
        
        # Always enable attention slicing (ComfyUI equivalent)
        try:
            pipeline.enable_attention_slicing("max")
            logger.info("✅ Max attention slicing enabled")
        except Exception as e:
            logger.warning(f"Attention slicing failed: {e}")
        
        # VAE optimizations for memory efficiency
        if hasattr(pipeline, 'vae'):
            try:
                if hasattr(pipeline.vae, 'enable_slicing'):
                    pipeline.vae.enable_slicing()
                    logger.info("✅ VAE slicing enabled")
                
                if hasattr(pipeline.vae, 'enable_tiling'):
                    pipeline.vae.enable_tiling()
                    logger.info("✅ VAE tiling enabled")
            except Exception as e:
                logger.warning(f"VAE optimizations failed: {e}")
        
        # Smart offloading based on VRAM availability (ComfyUI style)
        if vram_info["should_offload"] or model_type == "sdxl":
            logger.info("🧠 Enabling smart model offloading (ComfyUI style)...")
            
            try:
                # Sequential CPU offloading - moves model parts to CPU when not in use
                pipeline.enable_sequential_cpu_offload()
                logger.info("✅ Sequential CPU offload enabled (like ComfyUI)")
            except Exception as e:
                logger.warning(f"Sequential offload failed: {e}")
                try:
                    # Fallback to model offloading
                    pipeline.enable_model_cpu_offload()
                    logger.info("✅ Model CPU offload enabled (fallback)")
                except Exception as e2:
                    logger.warning(f"Model offload also failed: {e2}")
        
        # SDXL Turbo specific optimizations for GPU
        if model_type == "sdxl_turbo" and device.type == "cuda":
            logger.info("⚡ Applying SDXL Turbo GPU optimizations...")
            
            try:
                # Additional memory efficient attention for Turbo
                if hasattr(pipeline.unet, 'set_attn_processor'):
                    from diffusers.models.attention_processor import AttnProcessor2_0
                    pipeline.unet.set_attn_processor(AttnProcessor2_0())
                    logger.info("✅ Memory efficient attention processor enabled")
                    
            except Exception as e:
                logger.warning(f"SDXL Turbo optimizations failed: {e}")
    
    return pipeline

def load_model(model_name: str):
    """Load a specific model with ComfyUI-style memory management"""
    global pipeline, current_model
    
    if model_name not in available_models:
        raise ValueError(f"Model {model_name} not found")
    
    model_info = available_models[model_name]
    
    # Get model type first
    model_type = model_info["type"]
    
    # Check VRAM before loading
    vram_info = check_vram_availability()
    
    # Enhanced aggressive cleanup for SDXL loading
    if pipeline is not None:
        logger.info("🧹 Cleaning up previous model...")
        
        # Move pipeline to CPU first to free VRAM immediately
        try:
            pipeline = pipeline.to("cpu")
        except:
            pass
        
        # Delete pipeline components individually
        try:
            if hasattr(pipeline, 'unet'):
                del pipeline.unet
            if hasattr(pipeline, 'vae'):
                del pipeline.vae
            if hasattr(pipeline, 'text_encoder'):
                del pipeline.text_encoder
        except:
            pass
            
        del pipeline
        pipeline = None
        
        # Aggressive memory cleanup
        torch.cuda.empty_cache()
        torch.cuda.synchronize()
        
        import gc
        gc.collect()
        
        # Multiple cleanup rounds for SDXL
        if model_type == "sdxl":
            logger.info("🔧 Extra cleanup for SDXL loading...")
            torch.cuda.empty_cache()
            gc.collect()
            import time
            time.sleep(2)  # Give more time for SDXL
    
    logger.info(f"Loading model: {model_info['name']}")
    
    # Smart device selection based on model type and VRAM
    device, torch_dtype = detect_compute_device()
    
    # Model-specific device selection
    if model_type == "sdxl":
        # SDXL runs on CPU for stability (SDXL Turbo is the GPU option)
        logger.info("🔧 Loading SDXL on CPU for stability (use SDXL Turbo for GPU)")
        device = "cpu"
        torch_dtype = torch.float32
        
        # Check system RAM for CPU loading
        import psutil
        memory = psutil.virtual_memory()
        available_ram_gb = memory.available / 1024**3
        
        min_ram_for_sdxl = 2.0
        if available_ram_gb < min_ram_for_sdxl:
            raise ValueError(f"❌ Insufficient system RAM ({available_ram_gb:.1f}GB) for SDXL CPU. Need at least {min_ram_for_sdxl}GB available.")
        
        logger.info(f"✅ Loading SDXL on CPU with {available_ram_gb:.1f}GB RAM available")
    
    elif model_type == "sdxl_turbo":
        # SDXL Turbo is very 4GB-friendly
        logger.info("🔧 Optimizing SDXL Turbo for 4GB VRAM")
        
        import psutil
        memory = psutil.virtual_memory()
        available_ram_gb = memory.available / 1024**3
        
        # SDXL Turbo can usually run on GPU with 4GB VRAM
        if vram_info["free"] >= 1.5:
            logger.info(f"✅ Loading SDXL Turbo on GPU with {vram_info['free']:.1f}GB VRAM")
            device = "cuda"
            torch_dtype = torch.float16
        else:
            logger.info(f"⚠️ Loading SDXL Turbo on CPU with {available_ram_gb:.1f}GB RAM")
            device = "cpu"
            torch_dtype = torch.float32
    
    # Load model based on type with ComfyUI-style loading
    logger.info(f"🔄 Loading {model_type} model with ComfyUI-style optimizations...")
    
    if model_info["type"] == "sdxl":
        from diffusers import StableDiffusionXLPipeline
        
        # Memory-optimized loading for SDXL
        load_kwargs = {
            "torch_dtype": torch_dtype,
            "use_safetensors": True,
        }
        
        # CPU optimizations
        if device == "cpu":
            logger.info("🔧 Applying CPU-specific SDXL optimizations...")
            load_kwargs.update({
                "low_cpu_mem_usage": True,
                "load_in_4bit": False,  # Disable quantization for stability
                "torch_dtype": torch.float32,  # Use float32 for CPU
            })
            # Don't use device_map for CPU as it can cause issues
        elif device == "cuda":
            # GPU with aggressive offloading
            load_kwargs.update({
                "device_map": "auto",
                "max_memory": {0: "1GB", "cpu": "6GB"},  # Limit GPU memory, use CPU for overflow
            })
        else:
            load_kwargs["variant"] = "fp16" if torch_dtype == torch.float16 else None
        
        pipeline = StableDiffusionXLPipeline.from_single_file(
            model_info["path"],
            **load_kwargs
        )
    elif model_info["type"] == "sdxl_turbo":
        from diffusers import AutoPipelineForText2Image
        
        # SDXL Turbo optimized loading
        load_kwargs = {
            "torch_dtype": torch_dtype,
        }
        
        # Device-specific optimizations - simplified for SDXL Turbo
        if device == "cpu":
            logger.info("🔧 Applying CPU-specific SDXL Turbo optimizations...")
            load_kwargs.update({
                "low_cpu_mem_usage": True,
            })
        else:
            logger.info("🔧 Applying GPU-specific SDXL Turbo optimizations...")
            # Don't use device_map for SDXL Turbo - it's small enough to load directly
            pass
        
        pipeline = AutoPipelineForText2Image.from_pretrained(
            model_info["path"],
            **load_kwargs
        )
    else:  # SD 1.5
        from diffusers import StableDiffusionPipeline
        if model_name == "stable-diffusion-v1-5":
            # Use HuggingFace model
            pipeline = StableDiffusionPipeline.from_pretrained(
                model_info["path"],
                torch_dtype=torch_dtype,
                safety_checker=None,
                requires_safety_checker=False,
                variant="fp16" if torch_dtype == torch.float16 else None
            )
        else:
            # Use local safetensors file
            pipeline = StableDiffusionPipeline.from_single_file(
                model_info["path"],
                torch_dtype=torch_dtype,
                safety_checker=None,
                requires_safety_checker=False
            )
    
    # Move to device initially
    pipeline = pipeline.to(device)
    
    # Apply ComfyUI-style optimizations
    pipeline = apply_comfyui_style_optimizations(pipeline, model_type, vram_info)
    
    current_model = model_name
    available_models[model_name]["loaded"] = True
    
    # Mark other models as not loaded
    for name in available_models:
        if name != model_name:
            available_models[name]["loaded"] = False
    
    # Log final VRAM usage
    final_vram = check_vram_availability()
    logger.info(f"✅ Model {model_info['name']} loaded successfully!")
    logger.info(f"📊 Final VRAM: {final_vram['allocated']:.1f}GB used, {final_vram['free']:.1f}GB free")
    
    return True

def detect_compute_device():
    """Smart device detection with fallback"""
    try:
        # First check if CUDA is available and working
        if torch.cuda.is_available():
            # Test actual GPU access
            try:
                test_tensor = torch.randn(10, 10).cuda()
                device = "cuda"
                torch_dtype = torch.float16
                gpu_name = torch.cuda.get_device_name(0)
                gpu_memory = torch.cuda.get_device_properties(0).total_memory / 1024**3
                logger.info(f"🚀 GPU detected and tested: {gpu_name}")
                logger.info(f"💾 GPU Memory: {gpu_memory:.1f} GB")
                return device, torch_dtype
            except Exception as e:
                logger.warning(f"⚠️ GPU detected but not accessible: {e}")
                logger.info("🔄 Falling back to CPU")
    except Exception as e:
        logger.info(f"🔍 CUDA check failed: {e}")
    
    # Fallback to CPU
    device = "cpu"
    torch_dtype = torch.float32
    logger.info("🔧 Using CPU (portable mode)")
    return device, torch_dtype

def load_pipeline():
    """Load the Stable Diffusion pipeline with smart device detection"""
    global pipeline
    try:
        from diffusers import StableDiffusionPipeline
        
        # Smart device detection
        device, torch_dtype = detect_compute_device()
        
        logger.info("📦 Loading Stable Diffusion pipeline...")
        model_id = "runwayml/stable-diffusion-v1-5"
        
        # Load with device-specific settings
        pipeline = StableDiffusionPipeline.from_pretrained(
            model_id,
            torch_dtype=torch_dtype,
            safety_checker=None,
            requires_safety_checker=False
        )
        
        pipeline = pipeline.to(device)
        
        # Apply device-specific optimizations
        if device == "cuda":
            # GPU optimizations
            try:
                pipeline.enable_attention_slicing()
                pipeline.enable_memory_efficient_attention()
                logger.info("✅ GPU optimizations enabled")
            except Exception as e:
                logger.warning(f"⚠️ Some GPU optimizations failed: {e}")
                pipeline.enable_attention_slicing()  # Fallback to basic optimization
        else:
            # CPU optimizations
            pipeline.enable_attention_slicing()
            logger.info("✅ CPU optimizations enabled")
        
        # Performance estimate
        if device == "cuda":
            logger.info("⚡ Expected generation time: ~10-30 seconds per image")
        else:
            logger.info("🕒 Expected generation time: ~3-4 minutes per image")
        
        logger.info(f"🎨 Pipeline loaded successfully on {device.upper()}!")
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to load pipeline: {e}")
        return False

@app.on_event("startup")
async def startup_event():
    """Load the model on startup"""
    logger.info("Starting up SD server...")
    discover_models()
    current_model = "stable-diffusion-v1-5"
    success = load_pipeline()
    if not success:
        logger.warning("Failed to load SD pipeline, using fallback mode")

@app.get("/sdapi/v1/progress")
def progress():
    return {"progress": 0, "state": "ready", "current_image": None}

@app.get("/sdapi/v1/sd-models")
def models():
    """Return list of available models"""
    return [
        {
            "model_name": name,
            "title": info["name"],
            "hash": "local",
            "type": info["type"],
            "description": info["description"],
            "resolution": info["resolution"],
            "loaded": info["loaded"]
        }
        for name, info in available_models.items()
    ]

@app.get("/sdapi/v1/options")
def get_options():
    """Return current model info"""
    return {
        "sd_model_checkpoint": current_model,
        "available_models": available_models
    }

@app.post("/sdapi/v1/options")
def set_options(options: dict):
    """Set model options (including model switching)"""
    global current_model
    
    if "sd_model_checkpoint" in options:
        new_model = options["sd_model_checkpoint"]
        if new_model != current_model:
            try:
                load_model(new_model)
                return {"status": "success", "message": f"Switched to {new_model}"}
            except Exception as e:
                return {"status": "error", "message": str(e)}
    
    return {"status": "success", "message": "Options updated"}

@app.post("/sdapi/v1/refresh-checkpoints")
def refresh_checkpoints():
    """Refresh the list of available models"""
    discover_models()
    return {"status": "success", "message": "Models refreshed", "models": available_models}

@app.post("/sdapi/v1/txt2img")
def txt2img(request: ImageRequest):
    global pipeline
    
    try:
        if pipeline is None:
            # Fallback to enhanced placeholder
            return generate_enhanced_placeholder(request)
        
        # Handle seed generation
        if request.seed == -1:
            import random
            seed = random.randint(0, 2**32 - 1)
        else:
            seed = request.seed
            
        # Pre-generation memory check and optimization
        vram_info = check_vram_availability()
        
        # Smart parameter optimization for SDXL Turbo 
        if current_model and available_models.get(current_model, {}).get("type") == "sdxl_turbo":
            # SDXL Turbo works best with 1-4 steps
            if request.steps > 6:
                logger.info(f"🔧 SDXL Turbo: reducing steps from {request.steps} to 4 for optimal speed")
                request.steps = 4
            # SDXL Turbo can handle larger sizes well on 4GB VRAM
            if vram_info["free"] < 1.5:  # Very low VRAM
                logger.info(f"🔧 Low VRAM ({vram_info['free']:.1f}GB) - using conservative resolution")
                request.width = min(request.width, 512)
                request.height = min(request.height, 512)
        
        # Pre-generation cleanup for maximum available memory
        if vram_info["should_offload"]:
            logger.info("🧹 Pre-generation memory cleanup...")
            torch.cuda.empty_cache()
            torch.cuda.synchronize()
            import gc
            gc.collect()
                
        logger.info(f"Generating image for prompt: {request.prompt}")
        if request.negative_prompt:
            logger.info(f"Negative prompt: {request.negative_prompt}")
        logger.info(f"Using seed: {seed}")
        logger.info(f"Dimensions: {request.width}x{request.height}, Steps: {request.steps}")
        
        # Generate image using Stable Diffusion
        with torch.no_grad():
            result = pipeline(
                prompt=request.prompt,
                negative_prompt=request.negative_prompt if request.negative_prompt else None,
                width=request.width,
                height=request.height,
                num_inference_steps=request.steps,
                guidance_scale=request.cfg_scale,
                generator=torch.Generator().manual_seed(seed)
            )
        
        # Get the generated image
        image = result.images[0]
        
        # Post-generation cleanup (ComfyUI style)
        if vram_info["should_offload"]:
            logger.info("🧹 Post-generation cleanup...")
            del result
            torch.cuda.empty_cache()
            import gc
            gc.collect()
        
        # Convert to base64
        buffer = io.BytesIO()
        image.save(buffer, format='PNG')
        img_b64 = base64.b64encode(buffer.getvalue()).decode()
        
        # Final memory status
        final_vram = check_vram_availability()
        logger.info(f"✅ Image generated successfully! VRAM: {final_vram['allocated']:.1f}GB used, {final_vram['free']:.1f}GB free")
        
        return {
            "images": [img_b64],
            "parameters": {
                "prompt": request.prompt,
                "negative_prompt": request.negative_prompt,
                "width": request.width,
                "height": request.height,
                "steps": request.steps,
                "cfg_scale": request.cfg_scale,
                "seed": seed
            },
            "info": json.dumps({
                "prompt": request.prompt,
                "negative_prompt": request.negative_prompt,
                "width": request.width,
                "height": request.height,
                "steps": request.steps,
                "cfg_scale": request.cfg_scale,
                "seed": seed,
                "sampler": "Euler",
                "model": current_model,
                "model_info": available_models.get(current_model, {})
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