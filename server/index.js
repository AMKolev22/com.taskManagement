import express from 'express';
import { PrismaClient } from "../generated/prisma/client.js"
import cors from 'cors';
import path from 'path';
import fs from 'fs/promises';
import { FileUploadService } from './scripts/file-uploader.js'
import { dirname, filename } from './scripts/file-uploader.js';


const app = express();
const prisma = new PrismaClient();

app.use(express.json());
app.use(cors({
    origin: "http://localhost:8080"
}));

// Initialize file upload service
const fileUploadService = new FileUploadService();

// Helper to resolve/normalize a managerId passed from the client.
// Accepts either an existing Manager.managerId or a User.userId and returns a valid Manager.managerId.
async function resolveManagerId(prisma, inputId) {
    if (!inputId) return inputId;
    try {
        // If input matches an existing managerId, use it as-is
        const existing = await prisma.manager.findUnique({ where: { managerId: inputId } });
        if (existing) {
            return existing.managerId;
        }

        // Try to resolve via user record
        const user = await prisma.user.findUnique({ where: { userId: inputId } });
        if (user) {
            // Try to find a manager by email
            if (user.email) {
                const managerByEmail = await prisma.manager.findFirst({ where: { email: user.email } });
                if (managerByEmail) {
                    return managerByEmail.managerId;
                }
            }
            // Create a minimal manager record linked by userId as managerId
            const created = await prisma.manager.create({
                data: {
                    managerId: user.userId,
                    managerName: user.firstName || user.username || user.email || user.userId,
                    email: user.email || null,
                    department: user.department || null
                }
            });
            return created.managerId;
        }

        // Fallback: return as-is; FK layer will enforce correctness
        return inputId;
    } catch (e) {
        return inputId;
    }
}

/**
 * POST /api/upload
 * Upload a single file - NOW ACTUALLY SAVES THE FILE
 */
app.post('/api/upload', (req, res, next) => {
    fileUploadService.getUploadMiddleware().single('file')(req, res, next);
}, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: 'No file uploaded',
                message: 'Please select a file to upload'
            });
        }

        const { category, description, requestId } = req.body;

        if (!category || !description || !requestId) {
            // Delete uploaded file if validation fails (from temp folder)
            try {
                const tempFilePath = path.join(fileUploadService.uploadDir, 'temp', req.file.filename);
                await fs.unlink(tempFilePath);
            } catch (err) {
                console.error('Error deleting temp file:', err);
            }

            return res.status(400).json({
                error: 'Missing required fields',
                message: 'Category, description, and requestId are required'
            });
        }

        // Move file from temp folder to request ID / category folder
        try {
            await fileUploadService.moveFileToCategory(req.file.filename, category, requestId);
        } catch (error) {
            console.error('Error moving file:', error);
            return res.status(500).json({
                error: 'Failed to save file',
                message: error.message
            });
        }
        
        // Generate the file URL
        const fileUrl = fileUploadService.getFileUrl(req.file.filename, category, requestId, req);

        res.status(201).json({
            success: true,
            message: 'File uploaded successfully',
            data: {
                fileName: req.file.originalname,
                storedFileName: req.file.filename,
                description,
                category,
                fileSize: fileUploadService.formatFileSize(req.file.size),
                fileType: req.file.mimetype,
                fileUrl,
                uploadDate: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error uploading file:', error);
        res.status(500).json({
            error: 'Upload failed',
            message: error.message
        });
    }
});

/**
 * POST /api/upload/multiple
 * Upload multiple files - NOW ACTUALLY SAVES THE FILES
 */
app.post('/api/upload/multiple', (req, res, next) => {
    fileUploadService.getUploadMiddleware().array('files', 10)(req, res, next);
}, async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                error: 'No files uploaded',
                message: 'Please select files to upload'
            });
        }

        const { category, descriptions } = req.body;

        // Parse descriptions if sent as JSON string
        let descriptionArray = [];
        if (typeof descriptions === 'string') {
            try {
                descriptionArray = JSON.parse(descriptions);
            } catch (e) {
                descriptionArray = [descriptions];
            }
        } else if (Array.isArray(descriptions)) {
            descriptionArray = descriptions;
        }

        // Files are already saved by multer middleware
        const uploadedFiles = req.files.map((file, index) => {
            const fileUrl = fileUploadService.getFileUrl(file.filename, category, req);

            return {
                fileName: file.originalname,
                storedFileName: file.filename,
                description: descriptionArray[index] || 'No description provided',
                category,
                fileSize: fileUploadService.formatFileSize(file.size),
                fileType: file.mimetype,
                fileUrl,
                uploadDate: new Date().toISOString()
            };
        });

        res.status(201).json({
            success: true,
            message: `${uploadedFiles.length} file(s) uploaded successfully`,
            data: uploadedFiles
        });

    } catch (error) {
        console.error('Error uploading files:', error);
        res.status(500).json({
            error: 'Upload failed',
            message: error.message
        });
    }
});

/**
 * GET /api/files/:requestId/:category/:filename
 * Download/view a specific file organized by request ID
 */
app.get('/api/files/:requestId/:category/:filename', async (req, res) => {
    try {
        const { requestId, category, filename } = req.params;

        // Map URL category to internal category
        const categoryMap = {
            'food-costs': 'foodCosts',
            'travel-costs': 'travelCosts',
            'stay-costs': 'stayCosts'
        };

        const internalCategory = categoryMap[category] || category;
        const filePath = fileUploadService.getFilePath(filename, internalCategory, requestId);

        // Check if file exists
        try {
            await fs.access(filePath);
        } catch {
            return res.status(404).json({
                error: 'File not found',
                message: 'The requested file does not exist'
            });
        }

        // Send file
        res.sendFile(filePath);

    } catch (error) {
        console.error('Error serving file:', error);
        res.status(500).json({
            error: 'Error serving file',
            message: error.message
        });
    }
});

/**
 * DELETE /api/files/:requestId/:category/:filename
 * Delete a file organized by request ID
 */
app.delete('/api/files/:requestId/:category/:filename', async (req, res) => {
    try {
        const { requestId, category, filename } = req.params;

        const categoryMap = {
            'food-costs': 'foodCosts',
            'travel-costs': 'travelCosts',
            'stay-costs': 'stayCosts'
        };

        const internalCategory = categoryMap[category] || category;
        const filePath = fileUploadService.getFilePath(filename, internalCategory, requestId);
        
        try {
            await fs.unlink(filePath);
        } catch (error) {
            if (error.code === 'ENOENT') {
                return res.status(404).json({
                    error: 'File not found',
                    message: 'The requested file does not exist'
                });
            }
            throw error;
        }

        res.json({
            success: true,
            message: 'File deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting file:', error);
        res.status(500).json({
            error: 'Error deleting file',
            message: error.message
        });
    }
});

/**
 * POST /api/travel-requests
 * Creates a new travel reimbursement request
 * Files should already be uploaded via /api/upload before calling this
 */
app.post('/api/travel-requests', async (req, res) => {
    try {
        const payload = req.body;

        // Validate required fields
        if (!payload.requestId || !payload.travelInformation || !payload.approvingManager) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'requestId, travelInformation, and approvingManager are required'
            });
        }

        // Check if manager exists, create if not
        let manager = await prisma.manager.findUnique({
            where: { managerId: payload.approvingManager.managerId }
        });

        if (!manager) {
            manager = await prisma.manager.create({
                data: {
                    managerId: payload.approvingManager.managerId,
                    managerName: payload.approvingManager.managerName
                }
            });
        }

        // Create travel request with all expenses in a transaction
        const travelRequest = await prisma.$transaction(async (tx) => {
            // Create the main travel request
            const request = await tx.travelRequest.create({
                data: {
                    requestId: payload.requestId,
                    submittedDate: new Date(payload.submittedDate),
                    status: payload.status || 'PENDING_APPROVAL',

                    // Submitter Information
                    userId: payload.submitter?.userId || null,
                    submittedBy: payload.submitter?.submittedBy || null,
                    submittedByEmail: payload.submitter?.submittedByEmail || null,

                    // Travel Information
                    destination: payload.travelInformation.destination,
                    startDate: payload.travelInformation.startDate,
                    endDate: payload.travelInformation.endDate,
                    reason: payload.travelInformation.reason,
                    duration: payload.travelInformation.duration,

                    // Manager
                    managerId: manager.managerId,

                    // Summary
                    totalFoodReceipts: payload.summary?.totalFoodReceipts || 0,
                    totalTravelReceipts: payload.summary?.totalTravelReceipts || 0,
                    totalStayReceipts: payload.summary?.totalStayReceipts || 0,
                    totalAttachments: payload.summary?.totalAttachments || 0,

                    // Create related expenses
                    foodCosts: {
                        create: (payload.expenses?.foodCosts || []).map(expense => ({
                            fileName: expense.fileName,
                            description: expense.description,
                            fileSize: expense.fileSize,
                            fileType: expense.fileType,
                            uploadDate: new Date(expense.uploadDate),
                            fileUrl: expense.fileUrl || null,
                            status: 'PENDING',
                            rejectionReason: null
                        }))
                    },

                    travelCosts: {
                        create: (payload.expenses?.travelCosts || []).map(expense => ({
                            fileName: expense.fileName,
                            description: expense.description,
                            fileSize: expense.fileSize,
                            fileType: expense.fileType,
                            uploadDate: new Date(expense.uploadDate),
                            fileUrl: expense.fileUrl || null,
                            status: 'PENDING',
                            rejectionReason: null
                        }))
                    },

                    stayCosts: {
                        create: (payload.expenses?.stayCosts || []).map(expense => ({
                            fileName: expense.fileName,
                            description: expense.description,
                            fileSize: expense.fileSize,
                            fileType: expense.fileType,
                            uploadDate: new Date(expense.uploadDate),
                            fileUrl: expense.fileUrl || null,
                            status: 'PENDING',
                            rejectionReason: null
                        }))
                    }
                },
                include: {
                    manager: true,
                    foodCosts: true,
                    travelCosts: true,
                    stayCosts: true
                }
            });

            return request;
        });

        // Return success response
        res.status(201).json({
            success: true,
            message: 'Travel request created successfully',
            data: travelRequest
        });

    } catch (error) {
        console.error('Error creating travel request:', error);

        // Handle Prisma specific errors
        if (error.code === 'P2002') {
            return res.status(409).json({
                error: 'Duplicate request',
                message: 'A travel request with this ID already exists'
            });
        }

        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * GET /api/travel-requests
 * Get all travel requests with optional filtering
 */
app.get('/api/travel-requests', async (req, res) => {
    try {
        const { status, managerId, userId, limit = 50, offset = 0 } = req.query;

        const where = {};
        if (status) where.status = status;
        if (managerId) where.managerId = managerId;
        if (userId) where.userId = userId;

        const travelRequests = await prisma.travelRequest.findMany({
            where,
            include: {
                manager: true,
                foodCosts: true,
                travelCosts: true,
                stayCosts: true
            },
            orderBy: {
                submittedDate: 'desc'
            },
            take: parseInt(limit),
            skip: parseInt(offset)
        });

        const total = await prisma.travelRequest.count({ where });

        res.json({
            success: true,
            data: travelRequests,
            pagination: {
                total,
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });

    } catch (error) {
        console.error('Error fetching travel requests:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * GET /api/travel-requests/:id
 * Get a specific travel request by ID
 */
app.get('/api/travel-requests/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const travelRequest = await prisma.travelRequest.findUnique({
            where: { id },
            include: {
                manager: true,
                foodCosts: true,
                travelCosts: true,
                stayCosts: true
            }
        });

        if (!travelRequest) {
            return res.status(404).json({
                error: 'Not found',
                message: 'Travel request not found'
            });
        }

        res.json({
            success: true,
            data: travelRequest
        });

    } catch (error) {
        console.error('Error fetching travel request:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * PATCH /api/travel-requests/:id/status
 * Update the status of a travel request (approve/reject)
 */
app.patch('/api/travel-requests/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, approvedBy, rejectionReason, attachments } = req.body;

        if (!['APPROVED', 'REJECTED', 'PARTIALLY_REJECTED', 'PENDING_APPROVAL', 'CANCELLED'].includes(status)) {
            return res.status(400).json({
                error: 'Invalid status',
                message: 'Status must be APPROVED, REJECTED, PARTIALLY_REJECTED, PENDING_APPROVAL, or CANCELLED'
            });
        }

        const updateData = {
            status,
            updatedAt: new Date()
        };

        if (status === 'APPROVED') {
            updateData.approvedBy = approvedBy;
            updateData.approvedDate = new Date();
        } else if (status === 'REJECTED' || status === 'PARTIALLY_REJECTED') {
            updateData.rejectionReason = rejectionReason;
        } else if (status === 'PENDING_APPROVAL') {
            updateData.rejectionReason = null;
            updateData.approvedBy = null;
            updateData.approvedDate = null;
        }

        // Handle attachment status updates for partial rejection (for travel expenses)
        if (status === 'PARTIALLY_REJECTED' && attachments) {
            for (const attachment of attachments) {
                if (attachment.id) {
                    // Determine which table to update based on category
                    const categoryMap = {
                        'Food Costs': 'foodCosts',
                        'Travel Costs': 'travelCosts',
                        'Stay Costs': 'stayCosts'
                    };
                    
                    // For travel expenses, we'll update description to include rejection reason
                    // Note: Since the schema doesn't have status/rejectionReason fields for these models,
                    // we'll append the rejection reason to the description
                    try {
                        // Try to find in foodCosts
                        const foodCost = await prisma.foodCost.findUnique({
                            where: { id: attachment.id }
                        });
                        if (foodCost) {
                            await prisma.foodCost.update({
                                where: { id: attachment.id },
                                data: {
                                    description: foodCost.description + (attachment.rejectionReason ? '\n\n[REJECTED] ' + attachment.rejectionReason : '')
                                }
                            });
                            continue;
                        }
                    } catch (e) {
                        // Not found in foodCosts, try next
                    }
                    
                    try {
                        // Try to find in travelCosts
                        const travelCost = await prisma.travelCost.findUnique({
                            where: { id: attachment.id }
                        });
                        if (travelCost) {
                            await prisma.travelCost.update({
                                where: { id: attachment.id },
                                data: {
                                    description: travelCost.description + (attachment.rejectionReason ? '\n\n[REJECTED] ' + attachment.rejectionReason : '')
                                }
                            });
                            continue;
                        }
                    } catch (e) {
                        // Not found in travelCosts, try next
                    }
                    
                    try {
                        // Try to find in stayCosts
                        const stayCost = await prisma.stayCost.findUnique({
                            where: { id: attachment.id }
                        });
                        if (stayCost) {
                            await prisma.stayCost.update({
                                where: { id: attachment.id },
                                data: {
                                    description: stayCost.description + (attachment.rejectionReason ? '\n\n[REJECTED] ' + attachment.rejectionReason : '')
                                }
                            });
                            continue;
                        }
                    } catch (e) {
                        // Not found, skip
                    }
                }
            }
        }

        const travelRequest = await prisma.travelRequest.update({
            where: { id },
            data: updateData,
            include: {
                manager: true,
                foodCosts: true,
                travelCosts: true,
                stayCosts: true
            }
        });

        res.json({
            success: true,
            message: `Travel request ${status.toLowerCase()} successfully`,
            data: travelRequest
        });

    } catch (error) {
        console.error('Error updating travel request status:', error);

        if (error.code === 'P2025') {
            return res.status(404).json({
                error: 'Not found',
                message: 'Travel request not found'
            });
        }

        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * PATCH /api/travel-requests/:id
 * Update travel request (e.g., forward to another manager)
 */
app.patch('/api/travel-requests/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body || {};
        if (updateData.managerId) {
            updateData.managerId = await resolveManagerId(prisma, updateData.managerId);
        }

        const travelRequest = await prisma.travelRequest.update({
            where: { id },
            data: {
                ...updateData,
                updatedAt: new Date()
            },
            include: {
                manager: true,
                foodCosts: true,
                travelCosts: true,
                stayCosts: true
            }
        });

        res.json({
            success: true,
            message: 'Travel request updated successfully',
            data: travelRequest
        });
    } catch (error) {
        console.error('Error updating travel request:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * PATCH /api/travel-requests/:requestId/expense/:expenseId/status
 * Update the status of an individual expense file (FoodCost, TravelCost, or StayCost)
 */
app.patch('/api/travel-requests/:requestId/expense/:expenseId/status', async (req, res) => {
    try {
        const { requestId, expenseId } = req.params;
        const { status, rejectionReason, category } = req.body;

        if (!['APPROVED', 'REJECTED', 'PENDING'].includes(status)) {
            return res.status(400).json({
                error: 'Invalid status',
                message: 'Status must be APPROVED, REJECTED, or PENDING'
            });
        }

        // Determine which table to update based on category
        const categoryMap = {
            'Food Costs': 'foodCosts',
            'foodCosts': 'foodCosts',
            'Travel Costs': 'travelCosts',
            'travelCosts': 'travelCosts',
            'Stay Costs': 'stayCosts',
            'stayCosts': 'stayCosts'
        };

        const tableName = categoryMap[category] || 'foodCosts';
        let updatedExpense = null;

        const updateData = {
            status,
            updatedAt: new Date()
        };

        if (status === 'REJECTED' && rejectionReason) {
            updateData.rejectionReason = rejectionReason;
        } else if (status !== 'REJECTED') {
            updateData.rejectionReason = null;
        }

        // Update the appropriate expense table
        if (tableName === 'foodCosts') {
            updatedExpense = await prisma.foodCost.update({
                where: { id: expenseId },
                data: updateData
            });
        } else if (tableName === 'travelCosts') {
            updatedExpense = await prisma.travelCost.update({
                where: { id: expenseId },
                data: updateData
            });
        } else if (tableName === 'stayCosts') {
            updatedExpense = await prisma.stayCost.update({
                where: { id: expenseId },
                data: updateData
            });
        }

        if (!updatedExpense) {
            return res.status(404).json({
                error: 'Not found',
                message: 'Expense not found'
            });
        }

        // Check if request should be auto-set to PARTIALLY_REJECTED
        // This happens when there are mixed approved and rejected expenses
        try {
            const travelRequest = await prisma.travelRequest.findUnique({
                where: { requestId: requestId },
                include: {
                    foodCosts: true,
                    travelCosts: true,
                    stayCosts: true
                }
            });

            if (travelRequest && travelRequest.status === 'PENDING_APPROVAL') {
                // Combine all expenses
                const allExpenses = [
                    ...travelRequest.foodCosts,
                    ...travelRequest.travelCosts,
                    ...travelRequest.stayCosts
                ];

                if (allExpenses.length > 0) {
                    const approvedCount = allExpenses.filter(e => e.status === 'APPROVED').length;
                    const rejectedCount = allExpenses.filter(e => e.status === 'REJECTED').length;
                    const pendingCount = allExpenses.filter(e => e.status === 'PENDING').length;

                    // If we have both approved and rejected expenses, auto-set to PARTIALLY_REJECTED
                    if (approvedCount > 0 && rejectedCount > 0) {
                        await prisma.travelRequest.update({
                            where: { requestId: requestId },
                            data: {
                                status: 'PARTIALLY_REJECTED',
                                rejectionReason: 'Some attachments were rejected',
                                updatedAt: new Date()
                            }
                        });
                    }
                }
            }
        } catch (checkError) {
            // Don't fail the request if status check fails
            console.error('Error checking request status:', checkError);
        }

        res.json({
            success: true,
            message: `Expense ${status.toLowerCase()} successfully`,
            data: updatedExpense
        });

    } catch (error) {
        console.error('Error updating expense status:', error);

        if (error.code === 'P2025') {
            return res.status(404).json({
                error: 'Not found',
                message: 'Expense not found'
            });
        }

        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * DELETE /api/travel-requests/:id
 * Delete a travel request and associated files
 */
app.delete('/api/travel-requests/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Get travel request with files before deleting
        const travelRequest = await prisma.travelRequest.findUnique({
            where: { id },
            include: {
                foodCosts: true,
                travelCosts: true,
                stayCosts: true
            }
        });

        if (!travelRequest) {
            return res.status(404).json({
                error: 'Not found',
                message: 'Travel request not found'
            });
        }

        // Delete all associated files from disk
        const deleteFilePromises = [];

        travelRequest.foodCosts.forEach(cost => {
            if (cost.fileUrl) {
                const filename = path.basename(cost.fileUrl);
                deleteFilePromises.push(fileUploadService.deleteFile(filename, 'foodCosts'));
            }
        });

        travelRequest.travelCosts.forEach(cost => {
            if (cost.fileUrl) {
                const filename = path.basename(cost.fileUrl);
                deleteFilePromises.push(fileUploadService.deleteFile(filename, 'travelCosts'));
            }
        });

        travelRequest.stayCosts.forEach(cost => {
            if (cost.fileUrl) {
                const filename = path.basename(cost.fileUrl);
                deleteFilePromises.push(fileUploadService.deleteFile(filename, 'stayCosts'));
            }
        });

        await Promise.allSettled(deleteFilePromises);

        // Delete database record (cascades to related expenses)
        await prisma.travelRequest.delete({
            where: { id }
        });

        res.json({
            success: true,
            message: 'Travel request and associated files deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting travel request:', error);

        if (error.code === 'P2025') {
            return res.status(404).json({
                error: 'Not found',
                message: 'Travel request not found'
            });
        }

        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * GET /api/managers
 * Get all managers with optional email filter
 */
app.get('/api/managers', async (req, res) => {
    try {
        const { email } = req.query;
        
        const where = {};
        if (email) {
            where.email = email;
        }

        const managers = await prisma.manager.findMany({
            where,
            include: {
                _count: {
                    select: { travelRequests: true, equipmentRequests: true }
                }
            }
        });

        res.json({
            success: true,
            data: managers
        });

    } catch (error) {
        console.error('Error fetching managers:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * POST /api/users/login
 * User login endpoint
 */
app.post('/api/users/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'Email and password are required'
            });
        }

        const user = await prisma.user.findUnique({
            where: { email }
        });

        if (!user || user.password !== password) {
            return res.status(401).json({
                error: 'Invalid credentials',
                message: 'Invalid email or password'
            });
        }

        if (!user.isActive) {
            return res.status(403).json({
                error: 'Account disabled',
                message: 'Your account has been disabled'
            });
        }

        // Don't send password back
        const { password: _, ...userData } = user;

        res.json({
            success: true,
            data: userData
        });

    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * POST /api/users/auto-register
 * Auto-register a new user if not found
 */
app.post('/api/users/auto-register', async (req, res) => {
    try {
        const { password, email, firstName, lastName, role, department } = req.body;

        if (!password || !email) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'Password and email are required'
            });
        }

        // Check if email already exists
        const existingEmail = await prisma.user.findUnique({
            where: { email }
        });

        if (existingEmail) {
            return res.status(409).json({
                error: 'Email exists',
                message: 'Email already exists. Please use a different email.'
            });
        }

        // Generate unique userId and username from email
        const userId = 'USR-' + Date.now();
        const username = email.split('@')[0] + '_' + Date.now(); // Generate username from email

        // Create new user
        const newUser = await prisma.user.create({
            data: {
                userId,
                username,
                password, // In production, this should be hashed
                email,
                firstName: firstName || 'User',
                lastName: lastName || 'User',
                role: role || 'MANAGER',
                department: department || 'General',
                isActive: true
            }
        });

        // Don't send password back
        const { password: _, ...userData } = newUser;

        res.status(201).json({
            success: true,
            message: 'User created successfully',
            data: userData
        });

    } catch (error) {
        console.error('Error during auto-registration:', error);
        
        if (error.code === 'P2002') {
            return res.status(409).json({
                error: 'Unique constraint violation',
                message: 'Email already exists'
            });
        }

        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * GET /api/users
 * Get all users
 */
app.get('/api/users', async (req, res) => {
    try {
        const { role } = req.query;

        const where = {};
        if (role) where.role = role;

        const users = await prisma.user.findMany({
            where,
            select: {
                id: true,
                userId: true,
                username: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
                department: true,
                isActive: true,
                createdAt: true,
                updatedAt: true
            }
        });

        res.json({
            success: true,
            data: users
        });

    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * POST /api/vacation-requests
 * Create a new vacation request
 */
app.post('/api/vacation-requests', async (req, res) => {
    try {
        const payload = req.body;

        if (!payload.requestId || !payload.userId || !payload.managerId || !payload.substituteId) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'requestId, userId, managerId, and substituteId are required'
            });
        }

        const vacationRequest = await prisma.vacationRequest.create({
            data: {
                requestId: payload.requestId,
                submittedDate: payload.submittedDate ? new Date(payload.submittedDate) : new Date(),
                status: payload.status || 'PENDING_APPROVAL',
                startDate: new Date(payload.startDate),
                endDate: new Date(payload.endDate),
                vacationType: payload.vacationType,
                reason: payload.reason,
                userId: payload.userId,
                managerId: payload.managerId,
                substituteId: payload.substituteId,
                attachments: {
                    create: (payload.attachments || []).map(attachment => ({
                        fileName: attachment.fileName,
                        description: attachment.description,
                        fileSize: attachment.fileSize,
                        fileType: attachment.fileType,
                        uploadDate: new Date(attachment.uploadDate),
                        fileUrl: attachment.fileUrl || null,
                        status: 'PENDING'
                    }))
                }
            },
            include: {
                user: true,
                manager: true,
                substitute: true,
                attachments: true,
                comments: true
            }
        });

        res.status(201).json({
            success: true,
            message: 'Vacation request created successfully',
            data: vacationRequest
        });

    } catch (error) {
        console.error('Error creating vacation request:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * GET /api/vacation-requests
 * Get vacation requests with filters
 */
app.get('/api/vacation-requests', async (req, res) => {
    try {
        const { userId, managerId, status, limit = 50, offset = 0 } = req.query;

        const where = {};
        if (userId) where.userId = userId;
        if (managerId) where.managerId = managerId;
        if (status) where.status = status;

        const vacationRequests = await prisma.vacationRequest.findMany({
            where,
            include: {
                user: true,
                manager: true,
                substitute: true,
                attachments: true,
                comments: {
                    include: {
                        user: true
                    }
                }
            },
            orderBy: {
                submittedDate: 'desc'
            },
            take: parseInt(limit),
            skip: parseInt(offset)
        });

        const total = await prisma.vacationRequest.count({ where });

        res.json({
            success: true,
            data: vacationRequests,
            pagination: {
                total,
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });

    } catch (error) {
        console.error('Error fetching vacation requests:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * GET /api/vacation-requests/:id
 * Get a specific vacation request
 */
app.get('/api/vacation-requests/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const vacationRequest = await prisma.vacationRequest.findUnique({
            where: { id },
            include: {
                user: true,
                manager: true,
                substitute: true,
                attachments: true,
                comments: {
                    include: {
                        user: true
                    }
                }
            }
        });

        if (!vacationRequest) {
            return res.status(404).json({
                error: 'Not found',
                message: 'Vacation request not found'
            });
        }

        res.json({
            success: true,
            data: vacationRequest
        });

    } catch (error) {
        console.error('Error fetching vacation request:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * PATCH /api/vacation-requests/:id/status
 * Update vacation request status (with partial rejection support)
 */
app.patch('/api/vacation-requests/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, approvedBy, rejectionReason, attachments } = req.body;

        if (!['APPROVED', 'REJECTED', 'PARTIALLY_REJECTED', 'PENDING_APPROVAL', 'CANCELLED'].includes(status)) {
            return res.status(400).json({
                error: 'Invalid status',
                message: 'Status must be APPROVED, REJECTED, PARTIALLY_REJECTED, PENDING_APPROVAL, or CANCELLED'
            });
        }

        const updateData = {
            status,
            updatedAt: new Date()
        };

        if (status === 'APPROVED') {
            updateData.approvedBy = approvedBy;
            updateData.approvedDate = new Date();
        } else if (status === 'REJECTED' || status === 'PARTIALLY_REJECTED') {
            updateData.rejectionReason = rejectionReason;
        } else if (status === 'PENDING_APPROVAL') {
            updateData.rejectionReason = null;
            updateData.approvedBy = null;
            updateData.approvedDate = null;
        }

        // Handle attachment status updates for partial rejection
        if (status === 'PARTIALLY_REJECTED' && attachments) {
            for (const attachment of attachments) {
                if (attachment.id) {
                    await prisma.fileAttachment.update({
                        where: { id: attachment.id },
                        data: {
                            status: attachment.status,
                            rejectionReason: attachment.rejectionReason || null
                        }
                    });
                }
            }
        }

        const vacationRequest = await prisma.vacationRequest.update({
            where: { id },
            data: updateData,
            include: {
                user: true,
                manager: true,
                substitute: true,
                attachments: true,
                comments: true
            }
        });

        // If approved, create an availability (absence) record for the requester
        if (status === 'APPROVED') {
            try {
                // Avoid creating duplicates for the same exact period/type
                const existing = await prisma.availability.findFirst({
                    where: {
                        userId: vacationRequest.userId,
                        startDate: vacationRequest.startDate,
                        endDate: vacationRequest.endDate,
                        availabilityType: 'VACATION'
                    }
                });

                if (!existing) {
                    await prisma.availability.create({
                        data: {
                            userId: vacationRequest.userId,
                            startDate: vacationRequest.startDate,
                            endDate: vacationRequest.endDate,
                            reason: vacationRequest.reason || 'Vacation',
                            availabilityType: 'VACATION'
                        }
                    });
                }
            } catch (e) {
                // Non-blocking: log and continue
                console.error('Error creating availability for approved vacation:', e);
            }
        }

        res.json({
            success: true,
            message: `Vacation request ${status.toLowerCase()} successfully`,
            data: vacationRequest
        });

    } catch (error) {
        console.error('Error updating vacation request status:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * PATCH /api/vacation-requests/:id
 * Update vacation request (e.g., forward to another manager)
 */
app.patch('/api/vacation-requests/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body || {};
        if (updateData.managerId) {
            updateData.managerId = await resolveManagerId(prisma, updateData.managerId);
        }

        const vacationRequest = await prisma.vacationRequest.update({
            where: { id },
            data: {
                ...updateData,
                updatedAt: new Date()
            },
            include: {
                user: true,
                manager: true,
                substitute: true,
                attachments: true,
                comments: true
            }
        });

        res.json({
            success: true,
            message: 'Vacation request updated successfully',
            data: vacationRequest
        });

    } catch (error) {
        console.error('Error updating vacation request:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * POST /api/availability/check
 * Check if a user is available during a date range
 */
app.post('/api/availability/check', async (req, res) => {
    try {
        const { userId, startDate, endDate } = req.body;

        if (!userId || !startDate || !endDate) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'userId, startDate, and endDate are required'
            });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);

        // Check for overlapping unavailability
        const conflicts = await prisma.availability.findMany({
            where: {
                userId,
                OR: [
                    {
                        AND: [
                            { startDate: { lte: end } },
                            { endDate: { gte: start } }
                        ]
                    }
                ]
            }
        });

        const available = conflicts.length === 0;

        res.json({
            success: true,
            data: {
                available,
                conflicts: conflicts.map(c => ({
                    startDate: c.startDate,
                    endDate: c.endDate,
                    reason: c.reason
                }))
            }
        });

    } catch (error) {
        console.error('Error checking availability:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * GET /api/availability
 * Get availability for a user
 */
app.get('/api/availability', async (req, res) => {
    try {
        const { userId, type, availabilityType } = req.query;

        if (!userId) {
            return res.status(400).json({
                error: 'Missing required parameter',
                message: 'userId is required'
            });
        }

        const where = { userId };
        const requestedType = type || availabilityType;
        if (requestedType) {
            where.availabilityType = requestedType;
        }

        const availabilities = await prisma.availability.findMany({
            where,
            orderBy: { startDate: 'asc' }
        });

        res.json({
            success: true,
            data: availabilities
        });

    } catch (error) {
        console.error('Error fetching availability:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * POST /api/equipment-requests
 * Creates a new equipment request
 */
app.post('/api/equipment-requests', async (req, res) => {
    try {
        const payload = req.body;

        // Validate required fields
        if (!payload.requestId || !payload.approvingManager || !payload.equipmentItems) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'requestId, approvingManager, and equipmentItems are required'
            });
        }

        // Check if manager exists, create if not
        let manager = await prisma.manager.findUnique({
            where: { managerId: payload.approvingManager.managerId }
        });

        if (!manager) {
            manager = await prisma.manager.create({
                data: {
                    managerId: payload.approvingManager.managerId,
                    managerName: payload.approvingManager.managerName
                }
            });
        }

        // Create equipment request with all items in a transaction
        const equipmentRequest = await prisma.$transaction(async (tx) => {
            const request = await tx.equipmentRequest.create({
                data: {
                    requestId: payload.requestId,
                    submittedDate: new Date(payload.submittedDate),
                    status: payload.status || 'PENDING_APPROVAL',
                    managerId: manager.managerId,
                    totalCost: payload.totalCost || '0',
                    totalItems: payload.equipmentItems.length || 0,
                    equipmentItems: {
                        create: payload.equipmentItems.map(item => ({
                            type: item.type,
                            name: item.name,
                            cost: item.cost.toString(),
                            amount: item.amount,
                            reason: item.reason || ''
                        }))
                    }
                },
                include: {
                    manager: true,
                    equipmentItems: true
                }
            });

            return request;
        });

        // Return success response
        res.status(201).json({
            success: true,
            message: 'Equipment request created successfully',
            data: equipmentRequest
        });

    } catch (error) {
        console.error('Error creating equipment request:', error);

        // Handle Prisma specific errors
        if (error.code === 'P2002') {
            return res.status(409).json({
                error: 'Duplicate request',
                message: 'An equipment request with this ID already exists'
            });
        }

        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * GET /api/equipment-requests
 * Get all equipment requests with optional filtering
 */
app.get('/api/equipment-requests', async (req, res) => {
    try {
        const { status, managerId, limit = 50, offset = 0 } = req.query;

        const where = {};
        if (status) where.status = status;
        if (managerId) where.managerId = managerId;

        const equipmentRequests = await prisma.equipmentRequest.findMany({
            where,
            include: {
                manager: true,
                equipmentItems: true
            },
            orderBy: {
                submittedDate: 'desc'
            },
            take: parseInt(limit),
            skip: parseInt(offset)
        });

        const total = await prisma.equipmentRequest.count({ where });

        res.json({
            success: true,
            data: equipmentRequests,
            pagination: {
                total,
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });

    } catch (error) {
        console.error('Error fetching equipment requests:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * GET /api/equipment-requests/:id
 * Get a specific equipment request by ID
 */
app.get('/api/equipment-requests/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const equipmentRequest = await prisma.equipmentRequest.findUnique({
            where: { id },
            include: {
                manager: true,
                equipmentItems: true
            }
        });

        if (!equipmentRequest) {
            return res.status(404).json({
                error: 'Not found',
                message: 'Equipment request not found'
            });
        }

        res.json({
            success: true,
            data: equipmentRequest
        });

    } catch (error) {
        console.error('Error fetching equipment request:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * PATCH /api/equipment-requests/:id/status
 * Update the status of an equipment request (approve/reject)
 */
app.patch('/api/equipment-requests/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, approvedBy, rejectionReason, attachments } = req.body;

        if (!['APPROVED', 'REJECTED', 'PARTIALLY_REJECTED', 'PENDING_APPROVAL', 'CANCELLED'].includes(status)) {
            return res.status(400).json({
                error: 'Invalid status',
                message: 'Status must be APPROVED, REJECTED, PARTIALLY_REJECTED, PENDING_APPROVAL, or CANCELLED'
            });
        }

        const updateData = {
            status,
            updatedAt: new Date()
        };

        if (status === 'APPROVED') {
            updateData.approvedBy = approvedBy;
            updateData.approvedDate = new Date();
        } else if (status === 'REJECTED' || status === 'PARTIALLY_REJECTED') {
            updateData.rejectionReason = rejectionReason;
        } else if (status === 'PENDING_APPROVAL') {
            updateData.rejectionReason = null;
            updateData.approvedBy = null;
            updateData.approvedDate = null;
        }

        // Handle equipment item updates for partial rejection
        if (status === 'PARTIALLY_REJECTED' && attachments) {
            for (const attachment of attachments) {
                if (attachment.id) {
                    try {
                        // Update equipment item description with rejection reason
                        const equipmentItem = await prisma.equipmentItem.findUnique({
                            where: { id: attachment.id }
                        });
                        if (equipmentItem) {
                            await prisma.equipmentItem.update({
                                where: { id: attachment.id },
                                data: {
                                    reason: equipmentItem.reason + (attachment.rejectionReason ? '\n\n[REJECTED] ' + attachment.rejectionReason : '')
                                }
                            });
                        }
                    } catch (e) {
                        console.error('Error updating equipment item:', e);
                    }
                }
            }
        }

        const equipmentRequest = await prisma.equipmentRequest.update({
            where: { id },
            data: updateData,
            include: {
                manager: true,
                equipmentItems: true
            }
        });

        res.json({
            success: true,
            message: `Equipment request ${status.toLowerCase()} successfully`,
            data: equipmentRequest
        });

    } catch (error) {
        console.error('Error updating equipment request status:', error);

        if (error.code === 'P2025') {
            return res.status(404).json({
                error: 'Not found',
                message: 'Equipment request not found'
            });
        }

        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * PATCH /api/equipment-requests/:id
 * Update equipment request (e.g., forward to another manager)
 */
app.patch('/api/equipment-requests/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body || {};
        if (updateData.managerId) {
            updateData.managerId = await resolveManagerId(prisma, updateData.managerId);
        }

        const equipmentRequest = await prisma.equipmentRequest.update({
            where: { id },
            data: {
                ...updateData,
                updatedAt: new Date()
            },
            include: {
                manager: true,
                equipmentItems: true
            }
        });

        res.json({
            success: true,
            message: 'Equipment request updated successfully',
            data: equipmentRequest
        });
    } catch (error) {
        console.error('Error updating equipment request:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * GET /api/requests
 * Get all requests (both travel and equipment)
 */
app.get('/api/requests', async (req, res) => {
    try {
        const { status, managerId, type, limit = 50, offset = 0 } = req.query;

        const results = [];

        // Fetch travel requests
        const travelWhere = {};
        if (status) travelWhere.status = status;
        if (managerId) travelWhere.managerId = managerId;

        const travelRequests = await prisma.travelRequest.findMany({
            where: travelWhere,
            include: {
                manager: true,
                foodCosts: true,
                travelCosts: true,
                stayCosts: true
            },
            orderBy: {
                submittedDate: 'desc'
            },
            take: parseInt(limit),
            skip: parseInt(offset)
        });

        // Fetch equipment requests
        const equipmentWhere = {};
        if (status) equipmentWhere.status = status;
        if (managerId) equipmentWhere.managerId = managerId;

        const equipmentRequests = await prisma.equipmentRequest.findMany({
            where: equipmentWhere,
            include: {
                manager: true,
                equipmentItems: true
            },
            orderBy: {
                submittedDate: 'desc'
            },
            take: parseInt(limit),
            skip: parseInt(offset)
        });

        // Transform to unified format
        travelRequests.forEach(req => {
            results.push({
                id: req.id,
                requestId: req.requestId,
                title: req.destination || 'Travel Request',
                type: 'Travel',
                from: req.manager.managerName,
                hasFiles: (req.foodCosts.length + req.travelCosts.length + req.stayCosts.length) > 0,
                status: req.status,
                submittedDate: req.submittedDate,
                raw: req
            });
        });

        equipmentRequests.forEach(req => {
            results.push({
                id: req.id,
                requestId: req.requestId,
                title: `${req.totalItems} Equipment Items`,
                type: 'Equipment',
                from: req.manager.managerName,
                hasFiles: false,
                status: req.status,
                submittedDate: req.submittedDate,
                raw: req
            });
        });

        res.json({
            success: true,
            data: results,
            pagination: {
                total: results.length,
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });

    } catch (error) {
        console.error('Error fetching requests:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);

    // Handle multer errors
    if (err.name === 'MulterError') {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                error: 'File too large',
                message: 'File size exceeds 10MB limit'
            });
        }
        return res.status(400).json({
            error: 'Upload error',
            message: err.message
        });
    }

    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});

// Start server
const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
      console.log('✅ Initializing...');
      
      // Wait for file upload service directory initialization
      await fileUploadService.initializeUploadDirectory();
      console.log('✅ File upload service initialized');
      
      // Setup static file serving
      app.use('/api/files', express.static(path.join(dirname, 'uploads')));
      
      // Connect to database
      await prisma.$connect();
      console.log('✅ Database connected');
  
      const PORT = process.env.PORT || 3000;
      app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
      });
  
      // ✅ Do NOT call prisma.$disconnect() here — keep it alive
    } catch (err) {
      console.error('❌ Server startup failed:', err);
      process.exit(1);
    }
  }
  
startServer();

process.on('exit', (code) => {
    console.log(`🧹 Process exiting with code ${code}`);
  });
  process.on('beforeExit', () => {
    console.log('⏳ beforeExit triggered');
  });
  


