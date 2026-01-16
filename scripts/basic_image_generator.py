#!/usr/bin/env python3
"""
Basic image generator using only standard library
Creates simple PNG images without external dependencies
"""

import sys
import json
import struct
import zlib
import math

def create_png(width, height, pixels):
    """Create a PNG file from RGB pixel data"""
    def write_chunk(chunk_type, data):
        chunk_crc = zlib.crc32(data, zlib.crc32(chunk_type.encode('ascii')))
        return (struct.pack("!I", len(data)) +
                chunk_type.encode('ascii') +
                data +
                struct.pack("!I", chunk_crc & 0xffffffff))

    def write_png(width, height, pixels):
        raw_data = b''.join(
            b'\x00' + struct.pack("!%dI" % width, *row)
            for row in pixels
        )
        
        compressor = zlib.compressobj()
        compressed = compressor.compress(raw_data)
        compressed += compressor.flush()
        
        return (b'\x89PNG\r\n\x1a\n' +
                write_chunk('IHDR', struct.pack("!2I5B", width, height, 8, 2, 0, 0, 0)) +
                write_chunk('IDAT', compressed) +
                write_chunk('IEND', b''))
    
    # Convert RGB tuples to 32-bit integers (RGB + alpha)
    pixel_data = []
    for row in pixels:
        row_data = []
        for r, g, b in row:
            # Pack as 32-bit RGBA (alpha = 255)
            pixel = (r << 24) | (g << 16) | (b << 8) | 0xFF
            row_data.append(pixel)
        pixel_data.append(row_data)
    
    return write_png(width, height, pixel_data)

def text_to_colors(prompt):
    """Generate colors based on text prompt using hash"""
    colors = []
    for i, char in enumerate(prompt[:3]):
        hash_val = hash(prompt + str(i))
        r = (hash_val & 0xFF0000) >> 16
        g = (hash_val & 0x00FF00) >> 8
        b = hash_val & 0x0000FF
        colors.append((r, g, b))
    
    # Ensure we have at least 3 colors
    while len(colors) < 3:
        hash_val = hash(prompt + str(len(colors)))
        r = (hash_val & 0xFF0000) >> 16
        g = (hash_val & 0x00FF00) >> 8
        b = hash_val & 0x0000FF
        colors.append((r, g, b))
    
    return colors

def generate_gradient(width, height, colors, prompt):
    """Generate a gradient image with text elements"""
    pixels = []
    
    for y in range(height):
        row = []
        for x in range(width):
            # Create gradient based on position
            t_vertical = y / height
            t_horizontal = x / width
            
            # Mix colors based on position
            if t_vertical < 0.5:
                # Top half: gradient between first two colors
                ratio = t_vertical * 2
                color_a, color_b = colors[0], colors[1]
            else:
                # Bottom half: gradient between second and third colors
                ratio = (t_vertical - 0.5) * 2
                color_a, color_b = colors[1], colors[2]
            
            # Add some horizontal variation
            ratio += (t_horizontal * 0.3 - 0.15)
            ratio = max(0, min(1, ratio))
            
            # Linear interpolation between colors
            r = int(color_a[0] * (1 - ratio) + color_b[0] * ratio)
            g = int(color_a[1] * (1 - ratio) + color_b[1] * ratio)
            b = int(color_a[2] * (1 - ratio) + color_b[2] * ratio)
            
            # Add some pattern based on prompt
            if len(prompt) > 0:
                pattern_val = math.sin((x + y) * 0.1 + hash(prompt) * 0.001) * 20
                r = max(0, min(255, int(r + pattern_val)))
                g = max(0, min(255, int(g + pattern_val)))
                b = max(0, min(255, int(b + pattern_val)))
            
            row.append((r, g, b))
        
        pixels.append(row)
    
    return pixels

def add_text_pattern(pixels, width, height, prompt):
    """Add a simple text pattern to the image"""
    # Create a simple text representation
    text = prompt[:20]  # Limit text length
    
    # Add text as pixel patterns (very basic)
    start_y = height // 2 - 10
    start_x = max(0, (width - len(text) * 8) // 2)
    
    for i, char in enumerate(text):
        char_x = start_x + i * 8
        if char_x + 8 < width and start_y + 16 < height:
            # Create a simple character representation
            char_code = ord(char) % 16
            for py in range(8):
                for px in range(6):
                    if (char_code >> (px % 4)) & 1:
                        y_pos = start_y + py
                        x_pos = char_x + px
                        if 0 <= y_pos < height and 0 <= x_pos < width:
                            # Make text white
                            pixels[y_pos][x_pos] = (255, 255, 255)
    
    return pixels

def generate_image(prompt, width=512, height=512, style="natural"):
    """Generate an image based on prompt"""
    
    # Generate colors from prompt
    colors = text_to_colors(prompt)
    
    # Create base gradient
    pixels = generate_gradient(width, height, colors, prompt)
    
    # Add text pattern
    pixels = add_text_pattern(pixels, width, height, prompt)
    
    return pixels

def main():
    if len(sys.argv) < 2:
        print("Usage: python basic_image_generator.py '<prompt>' [options]")
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
        pixels = generate_image(prompt, width, height, style)
        png_data = create_png(width, height, pixels)
        
        # Write to file
        with open(output_path, 'wb') as f:
            f.write(png_data)
        
        # Output metadata
        result = {
            "success": True,
            "output_path": output_path,
            "prompt": prompt,
            "width": width,
            "height": height,
            "style": style,
            "file_size": len(png_data)
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