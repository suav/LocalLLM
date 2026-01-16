const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const config = require('../config');

// Base storage directory
const STORAGE_BASE = path.join(process.cwd(), 'data', 'users');

// Ensure storage directories exist
async function ensureUserDirectories(userId) {
  const userDir = path.join(STORAGE_BASE, userId.toString());
  const dirs = [
    userDir,
    path.join(userDir, 'images'),
    path.join(userDir, 'documents'),
    path.join(userDir, 'artifacts')
  ];
  
  for (const dir of dirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      console.error(`Failed to create directory ${dir}:`, error);
    }
  }
  
  return {
    base: userDir,
    images: path.join(userDir, 'images'),
    documents: path.join(userDir, 'documents'),
    artifacts: path.join(userDir, 'artifacts')
  };
}

// Generate unique filename
function generateFileName(originalName, extension = '') {
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString('hex');
  const baseName = originalName ? 
    originalName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase() : 
    'file';
  return `${timestamp}_${random}_${baseName}${extension}`;
}

// Save file with metadata
async function saveFile(userId, fileBuffer, originalName, fileType, category = 'documents') {
  try {
    console.log(`Saving file for user ${userId}: ${originalName} (${fileType}), size: ${fileBuffer.length} bytes`);
    
    const directories = await ensureUserDirectories(userId);
    const targetDir = directories[category];
    
    // Determine file extension based on file type if not in original name
    let ext = path.extname(originalName || '') || '';
    
    // If no extension, try to determine from fileType
    if (!ext && fileType) {
      if (fileType.includes('png')) ext = '.png';
      else if (fileType.includes('jpeg') || fileType.includes('jpg')) ext = '.jpg';
      else if (fileType.includes('pdf')) ext = '.pdf';
      else if (fileType.includes('text')) ext = '.txt';
    }
    
    const fileName = generateFileName(originalName, ext);
    const filePath = path.join(targetDir, fileName);
    
    console.log(`Writing file to: ${filePath}`);
    
    // Save file
    await fs.writeFile(filePath, fileBuffer);
    
    // Verify file was written
    const stats = await fs.stat(filePath);
    console.log(`File written successfully: ${stats.size} bytes`);
    
    // Create metadata
    const metadata = {
      id: crypto.randomUUID(),
      fileName,
      originalName: originalName || fileName,
      filePath,
      relativePath: path.relative(STORAGE_BASE, filePath),
      fileType,
      category,
      size: stats.size,
      userId,
      createdAt: new Date().toISOString(),
      checksum: crypto.createHash('sha256').update(fileBuffer).digest('hex')
    };
    
    console.log(`File metadata created:`, metadata);
    return metadata;
  } catch (error) {
    console.error('Error saving file:', error);
    throw new Error('Failed to save file');
  }
}

// Get file metadata by user
async function getUserFiles(userId, category = null) {
  try {
    const directories = await ensureUserDirectories(userId);
    const files = [];
    
    const categoriesToSearch = category ? [category] : ['images', 'documents', 'artifacts'];
    
    for (const cat of categoriesToSearch) {
      const categoryDir = directories[cat];
      try {
        const fileNames = await fs.readdir(categoryDir);
        
        for (const fileName of fileNames) {
          if (fileName.startsWith('.')) continue; // Skip hidden files
          
          const filePath = path.join(categoryDir, fileName);
          const stats = await fs.stat(filePath);
          
          if (stats.isFile()) {
            // Extract original name from filename (remove timestamp and random prefix)
            const originalName = fileName.replace(/^\d+_[a-f0-9]+_/, '');
            
            // Determine file type based on extension
            const ext = path.extname(fileName).toLowerCase();
            let fileType = 'application/octet-stream'; // default
            
            if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) {
              fileType = ext === '.png' ? 'image/png' : 
                        ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
                        ext === '.webp' ? 'image/webp' : 'image/gif';
            } else if (ext === '.pdf') {
              fileType = 'application/pdf';
            } else if (['.txt', '.md'].includes(ext)) {
              fileType = 'text/plain';
            } else if (ext === '.json') {
              fileType = 'application/json';
            } else if (['.doc', '.docx'].includes(ext)) {
              fileType = ext === '.doc' ? 'application/msword' : 
                        'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            } else if (ext === '.csv') {
              fileType = 'text/csv';
            }
            
            files.push({
              id: crypto.createHash('md5').update(`${userId}_${fileName}`).digest('hex'),
              fileName,
              originalName,
              relativePath: path.relative(STORAGE_BASE, filePath),
              filePath,
              fileType,
              category: cat,
              size: stats.size,
              userId,
              createdAt: stats.birthtime.toISOString(),
              modifiedAt: stats.mtime.toISOString()
            });
          }
        }
      } catch (error) {
        // Directory might not exist yet
        console.log(`Category directory ${cat} not found for user ${userId}`);
      }
    }
    
    return files.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (error) {
    console.error('Error getting user files:', error);
    return [];
  }
}

// Delete file
async function deleteFile(userId, fileId) {
  try {
    const userFiles = await getUserFiles(userId);
    const file = userFiles.find(f => f.id === fileId);
    
    if (!file) {
      throw new Error('File not found');
    }
    
    await fs.unlink(file.filePath);
    return true;
  } catch (error) {
    console.error('Error deleting file:', error);
    throw new Error('Failed to delete file');
  }
}

// Get file content
async function getFile(userId, fileId) {
  try {
    const userFiles = await getUserFiles(userId);
    const file = userFiles.find(f => f.id === fileId);
    
    if (!file) {
      throw new Error('File not found');
    }
    
    const content = await fs.readFile(file.filePath);
    return { file, content };
  } catch (error) {
    console.error('Error reading file:', error);
    throw new Error('Failed to read file');
  }
}

// Clean up old files (optional maintenance)
async function cleanupOldFiles(userId, category, maxAge = 30 * 24 * 60 * 60 * 1000) {
  try {
    const userFiles = await getUserFiles(userId, category);
    const cutoffDate = new Date(Date.now() - maxAge);
    
    const filesToDelete = userFiles.filter(file => 
      new Date(file.createdAt) < cutoffDate
    );
    
    for (const file of filesToDelete) {
      await fs.unlink(file.filePath);
    }
    
    return filesToDelete.length;
  } catch (error) {
    console.error('Error cleaning up files:', error);
    return 0;
  }
}

module.exports = {
  ensureUserDirectories,
  saveFile,
  getUserFiles,
  deleteFile,
  getFile,
  cleanupOldFiles,
  generateFileName,
  STORAGE_BASE
};