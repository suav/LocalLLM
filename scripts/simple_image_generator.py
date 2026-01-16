#!/usr/bin/env python3
"""
Simple local image generator using PIL/Pillow
Creates procedural images based on text prompts
Fallback for when SD/Ollama are not available
"""

import sys
import json
import os
import random
from PIL import Image, ImageDraw, ImageFont
import colorsys

def text_to_color_palette(prompt):
    """Convert text prompt to a color palette using hash-based generation"""
    # Simple hash-based color generation
    hash_val = hash(prompt.lower())
    random.seed(hash_val)
    
    colors = []
    for i in range(3):
        hue = (hash_val + i * 137.508) % 360 / 360.0  # Golden angle for distribution
        saturation = 0.4 + 0.4 * random.random()  # 40-80% saturation
        lightness = 0.3 + 0.4 * random.random()   # 30-70% lightness
        
        rgb = colorsys.hls_to_rgb(hue, lightness, saturation)
        colors.append(tuple(int(c * 255) for c in rgb))
    
    return colors

def generate_abstract_image(prompt, width=512, height=512, style="natural"):
    """Generate an abstract image based on the prompt"""
    
    # Create base image
    image = Image.new('RGB', (width, height), 'white')
    draw = ImageDraw.Draw(image)
    
    # Get color palette from prompt
    colors = text_to_color_palette(prompt)
    
    # Style-specific generation
    if style == "geometric":
        generate_geometric_pattern(draw, width, height, colors, prompt)
    elif style == "organic":
        generate_organic_pattern(draw, width, height, colors, prompt)
    elif style == "artistic":
        generate_artistic_pattern(draw, width, height, colors, prompt)
    else:  # natural/default
        generate_gradient_pattern(draw, width, height, colors, prompt)
    
    # Add text overlay
    add_text_overlay(draw, prompt, width, height)
    
    return image

def generate_gradient_pattern(draw, width, height, colors, prompt):
    """Generate a gradient background with shapes"""
    # Create gradient background
    for y in range(height):
        ratio = y / height
        r = int(colors[0][0] * (1-ratio) + colors[1][0] * ratio)
        g = int(colors[0][1] * (1-ratio) + colors[1][1] * ratio)
        b = int(colors[0][2] * (1-ratio) + colors[1][2] * ratio)
        draw.line([(0, y), (width, y)], fill=(r, g, b))
    
    # Add some shapes based on prompt keywords
    hash_val = hash(prompt)
    random.seed(hash_val)
    
    for _ in range(3):
        x = random.randint(0, width)
        y = random.randint(0, height)
        size = random.randint(20, min(width, height) // 4)
        color = colors[random.randint(0, len(colors)-1)]
        
        # Add some transparency
        overlay = Image.new('RGBA', (width, height), (0, 0, 0, 0))
        overlay_draw = ImageDraw.Draw(overlay)
        overlay_draw.ellipse([x-size, y-size, x+size, y+size], 
                           fill=(*color, 100))  # Semi-transparent
        
        # Composite the overlay
        image = Image.alpha_composite(
            Image.new('RGBA', (width, height), (255, 255, 255, 255)),
            overlay
        )

def generate_geometric_pattern(draw, width, height, colors, prompt):
    """Generate geometric patterns"""
    # Fill background
    draw.rectangle([0, 0, width, height], fill=colors[0])
    
    hash_val = hash(prompt)
    random.seed(hash_val)
    
    # Draw geometric shapes
    for i in range(8):
        shape_type = random.choice(['rectangle', 'circle', 'triangle'])
        color = colors[random.randint(0, len(colors)-1)]
        
        x = random.randint(0, width)
        y = random.randint(0, height)
        size = random.randint(30, min(width, height) // 3)
        
        if shape_type == 'rectangle':
            draw.rectangle([x, y, x+size, y+size], fill=color)
        elif shape_type == 'circle':
            draw.ellipse([x, y, x+size, y+size], fill=color)

def generate_organic_pattern(draw, width, height, colors, prompt):
    """Generate organic, flowing patterns"""
    # Gradient background
    for y in range(height):
        ratio = y / height
        color_index = int(ratio * (len(colors) - 1))
        next_color_index = min(color_index + 1, len(colors) - 1)
        local_ratio = (ratio * (len(colors) - 1)) - color_index
        
        r = int(colors[color_index][0] * (1-local_ratio) + colors[next_color_index][0] * local_ratio)
        g = int(colors[color_index][1] * (1-local_ratio) + colors[next_color_index][1] * local_ratio)
        b = int(colors[color_index][2] * (1-local_ratio) + colors[next_color_index][2] * local_ratio)
        
        draw.line([(0, y), (width, y)], fill=(r, g, b))

def generate_artistic_pattern(draw, width, height, colors, prompt):
    """Generate artistic brush-like patterns"""
    # Base color
    draw.rectangle([0, 0, width, height], fill=colors[0])
    
    hash_val = hash(prompt)
    random.seed(hash_val)
    
    # Create brush strokes
    for _ in range(20):
        color = colors[random.randint(0, len(colors)-1)]
        x1 = random.randint(0, width)
        y1 = random.randint(0, height)
        x2 = x1 + random.randint(-100, 100)
        y2 = y1 + random.randint(-100, 100)
        width_stroke = random.randint(3, 15)
        
        draw.line([x1, y1, x2, y2], fill=color, width=width_stroke)

def add_text_overlay(draw, prompt, width, height):
    """Add text overlay to the image"""
    try:
        # Try to use a system font
        font_size = max(16, min(width, height) // 20)
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
        except:
            font = ImageFont.load_default()
        
        # Truncate long prompts
        display_text = prompt[:50] + "..." if len(prompt) > 50 else prompt
        
        # Get text dimensions
        bbox = draw.textbbox((0, 0), display_text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        
        # Center the text
        x = (width - text_width) // 2
        y = height - text_height - 20
        
        # Add semi-transparent background for text
        padding = 10
        draw.rectangle([x-padding, y-padding, x+text_width+padding, y+text_height+padding],
                      fill=(0, 0, 0, 128))
        
        # Draw text
        draw.text((x, y), display_text, font=font, fill=(255, 255, 255))
        
    except Exception as e:
        # Fallback: just add a simple text
        draw.text((20, height-40), prompt[:30], fill=(255, 255, 255))

def main():
    if len(sys.argv) < 2:
        print("Usage: python simple_image_generator.py '<prompt>' [options]")
        sys.exit(1)
    
    # Parse arguments
    prompt = sys.argv[1]
    
    # Default options
    width = 512
    height = 512
    style = "natural"
    output_path = "generated_image.png"
    
    # Parse additional JSON options if provided
    if len(sys.argv) > 2:
        try:
            options = json.loads(sys.argv[2])
            width = options.get('width', width)
            height = options.get('height', height)
            style = options.get('style', style)
            output_path = options.get('output', output_path)
        except:
            pass
    
    # Generate image
    try:
        image = generate_abstract_image(prompt, width, height, style)
        image.save(output_path, 'PNG')
        
        # Output metadata
        result = {
            "success": True,
            "output_path": output_path,
            "prompt": prompt,
            "width": width,
            "height": height,
            "style": style,
            "file_size": os.path.getsize(output_path)
        }
        
        print(json.dumps(result))
        
    except Exception as e:
        result = {
            "success": False,
            "error": str(e)
        }
        print(json.dumps(result))
        sys.exit(1)

if __name__ == "__main__":
    main()