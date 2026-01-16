const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const router = express.Router();

const { saveFile, getUserFiles, deleteFile, getFile } = require('../storage');
const { generateImage, processUploadedImage, getAvailableImageModels } = require('../images');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
    files: 10 // Max 10 files at once
  },
  fileFilter: (req, file, cb) => {
    // Allow images and documents
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'text/plain',
      'text/markdown',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/csv',
      'application/json'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`), false);
    }
  }
});

// Get user's files
router.get('/files', async (req, res) => {
  try {
    const { category } = req.query;
    const files = await getUserFiles(req.session.userId, category);
    
    res.json({
      files: files.map(file => ({
        ...file,
        url: `/api/files/${file.id}`,
        downloadUrl: `/api/files/${file.id}/download`
      }))
    });
  } catch (error) {
    console.error('Error getting files:', error);
    res.status(500).json({ error: 'Failed to retrieve files' });
  }
});

// Upload files
router.post('/files/upload', upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    
    const uploadedFiles = [];
    
    for (const file of req.files) {
      let fileBuffer = file.buffer;
      let fileType = file.mimetype;
      
      // Process images
      if (file.mimetype.startsWith('image/')) {
        try {
          const processed = await processUploadedImage(file.buffer, {
            maxWidth: 1920,
            maxHeight: 1080,
            quality: 85,
            format: file.mimetype.includes('png') ? 'png' : 'jpeg'
          });
          fileBuffer = processed.buffer;
          fileType = file.mimetype.includes('png') ? 'image/png' : 'image/jpeg';
        } catch (error) {
          console.error('Error processing image:', error);
          // Use original if processing fails
        }
      }
      
      // Determine category
      const category = file.mimetype.startsWith('image/') ? 'images' : 'documents';
      
      // Save file
      const metadata = await saveFile(
        req.session.userId,
        fileBuffer,
        file.originalname,
        fileType,
        category
      );
      
      uploadedFiles.push({
        ...metadata,
        url: `/api/files/${metadata.id}`,
        downloadUrl: `/api/files/${metadata.id}/download`
      });
    }
    
    res.json({ 
      message: `Successfully uploaded ${uploadedFiles.length} file(s)`,
      files: uploadedFiles 
    });
  } catch (error) {
    console.error('Error uploading files:', error);
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

// Get available image models
router.get('/images/models', async (req, res) => {
  try {
    const models = await getAvailableImageModels();
    res.json({ models });
  } catch (error) {
    console.error('Error getting image models:', error);
    res.status(500).json({ error: 'Failed to get available models' });
  }
});

// Generate image
router.post('/images/generate', async (req, res) => {
  try {
    const { prompt, width, height, style, quality, model, steps, guidanceScale } = req.body;
    
    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    
    const options = {
      model: model || 'auto',
      width: parseInt(width) || 512,
      height: parseInt(height) || 512,
      style: style || 'natural',
      quality: quality || 'standard',
      steps: parseInt(steps) || 20,
      guidanceScale: parseFloat(guidanceScale) || 7.5
    };
    
    console.log(`Generating image for user ${req.session.userId} with options:`, options);
    
    const imageMetadata = await generateImage(req.session.userId, prompt.trim(), options);
    
    res.json({
      ...imageMetadata,
      url: `/api/files/${imageMetadata.id}`,
      downloadUrl: `/api/files/${imageMetadata.id}/download`
    });
  } catch (error) {
    console.error('Error generating image:', error);
    res.status(500).json({ error: error.message || 'Failed to generate image' });
  }
});

// Get file by ID (view in browser)
router.get('/files/:fileId', async (req, res) => {
  try {
    const { file, content } = await getFile(req.session.userId, req.params.fileId);
    
    res.set({
      'Content-Type': file.fileType || 'application/octet-stream',
      'Content-Length': content.length,
      'Cache-Control': 'public, max-age=31536000' // 1 year cache
    });
    
    res.send(content);
  } catch (error) {
    console.error('Error getting file:', error);
    res.status(404).json({ error: 'File not found' });
  }
});

// Download file
router.get('/files/:fileId/download', async (req, res) => {
  try {
    const { file, content } = await getFile(req.session.userId, req.params.fileId);
    
    // Ensure the download filename has proper extension
    let downloadName = file.originalName || file.fileName;
    if (file.fileType && file.fileType.startsWith('image/') && !downloadName.includes('.')) {
      const ext = file.fileType === 'image/png' ? '.png' : 
                  file.fileType === 'image/jpeg' ? '.jpg' : 
                  file.fileType === 'image/webp' ? '.webp' : '.png';
      downloadName = downloadName + ext;
    }
    
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${downloadName}"`,
      'Content-Length': content.length
    });
    
    res.send(content);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(404).json({ error: 'File not found' });
  }
});

// Delete file
router.delete('/files/:fileId', async (req, res) => {
  try {
    await deleteFile(req.session.userId, req.params.fileId);
    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Get file metadata
router.get('/files/:fileId/info', async (req, res) => {
  try {
    const { file } = await getFile(req.session.userId, req.params.fileId);
    
    res.json({
      ...file,
      url: `/api/files/${file.id}`,
      downloadUrl: `/api/files/${file.id}/download`
    });
  } catch (error) {
    console.error('Error getting file info:', error);
    res.status(404).json({ error: 'File not found' });
  }
});

// Error handling middleware
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large (max 50MB)' });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files (max 10)' });
    }
  }
  
  if (error.message.includes('File type')) {
    return res.status(400).json({ error: error.message });
  }
  
  console.error('File upload error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = router;