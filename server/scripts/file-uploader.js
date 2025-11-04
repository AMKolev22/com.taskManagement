import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

export const filename = fileURLToPath(import.meta.url);
export const dirname = path.dirname(filename);

export class FileUploadService {
    constructor() {
        this.uploadDir = path.join(dirname, 'uploads');
    }

    /**
     * Initialize upload directory structure
     */
    async initializeUploadDirectory() {
        try {
            // Create main uploads directory
            await fs.mkdir(this.uploadDir, { recursive: true });
            
            // Create temp directory for initial uploads
            await fs.mkdir(path.join(this.uploadDir, 'temp'), { recursive: true });

            console.log('✅ Upload directories initialized');
        } catch (error) {
            console.error('Error initializing upload directories:', error);
        }
    }

    /**
     * Generate unique filename
     */
    generateUniqueFilename(originalFilename) {
        const timestamp = Date.now();
        const randomString = crypto.randomBytes(8).toString('hex');
        const ext = path.extname(originalFilename);
        const nameWithoutExt = path.basename(originalFilename, ext);

        // Sanitize filename
        const sanitizedName = nameWithoutExt
            .replace(/[^a-zA-Z0-9-_]/g, '_')
            .substring(0, 50);

        return `${sanitizedName}_${timestamp}_${randomString}${ext}`;
    }

    /**
     * Get category directory
     */
    getCategoryDirectory(category) {
        const categoryMap = {
            'foodCosts': 'food-costs',
            'travelCosts': 'travel-costs',
            'stayCosts': 'stay-costs'
        };

        return categoryMap[category] || 'misc';
    }

    /**
     * Configure multer storage - saves to temp folder initially
     */
    getMulterStorage() {
        const tempDir = path.join(this.uploadDir, 'temp');
        return multer.diskStorage({
            destination: (req, file, cb) => {
                cb(null, tempDir);
            },
            filename: (req, file, cb) => {
                const uniqueFilename = this.generateUniqueFilename(file.originalname);
                cb(null, uniqueFilename);
            }
        });
    }
    
    /**
     * Move file from temp to correct category folder organized by request ID
     */
    async moveFileToCategory(filename, category, requestId) {
        try {
            const tempPath = path.join(this.uploadDir, 'temp', filename);
            const categoryDir = this.getCategoryDirectory(category);
            
            // Organize by requestId/category structure
            const finalDir = path.join(this.uploadDir, requestId, categoryDir);
            
            // Ensure directory exists
            await fs.mkdir(finalDir, { recursive: true });
            
            // Move file to category folder
            const finalPath = path.join(finalDir, filename);
            await fs.rename(tempPath, finalPath);
            
            return finalPath;
        } catch (error) {
            console.error('Error moving file to category:', error);
            throw error;
        }
    }

    /**
     * File filter for allowed types
     */
    fileFilter(req, file, cb) {
        const allowedMimes = [
            'application/pdf',
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/gif',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ];

        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only PDF, images, and Office documents are allowed.'), false);
        }
    }

    /**
     * Get multer upload middleware
     */
    getUploadMiddleware() {
        return multer({
            storage: this.getMulterStorage(),
            fileFilter: this.fileFilter.bind(this),
            limits: {
                fileSize: 10 * 1024 * 1024 // 10MB limit
            }
        });
    }

    /**
     * Get file URL organized by request ID
     */
    getFileUrl(filename, category, requestId, req) {
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const categoryDir = this.getCategoryDirectory(category);
        return `${baseUrl}/api/files/${requestId}/${categoryDir}/${filename}`;
    }

    /**
     * Get file path organized by request ID
     */
    getFilePath(filename, category, requestId) {
        const categoryDir = this.getCategoryDirectory(category);
        return path.join(this.uploadDir, requestId, categoryDir, filename);
    }

    /**
     * Delete file
     */
    async deleteFile(filename, category) {
        try {
            const filePath = this.getFilePath(filename, category);
            await fs.unlink(filePath);
            return true;
        } catch (error) {
            console.error('Error deleting file:', error);
            return false;
        }
    }

    /**
     * Check if file exists
     */
    async fileExists(filename, category) {
        try {
            const filePath = this.getFilePath(filename, category);
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get file info
     */
    async getFileInfo(filename, category) {
        try {
            const filePath = this.getFilePath(filename, category);
            const stats = await fs.stat(filePath);

            return {
                filename,
                size: stats.size,
                sizeFormatted: this.formatFileSize(stats.size),
                createdAt: stats.birthtime,
                modifiedAt: stats.mtime
            };
        } catch (error) {
            return null;
        }
    }

    /**
     * Format file size
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
}