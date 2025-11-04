sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "taskManagement/controller/Base.controller",
    "taskManagement/model/models",
    "sap/ui/core/Fragment",
    "taskManagement/model/formatter"
], function (Controller, JSONModel, Filter, FilterOperator, MessageBox, MessageToast, Base, Models, Fragment, formatter) {
    "use strict";

    return Base.extend("taskManagement.controller.TaskDetails", {
        formatter: formatter,

        onInit: function () {
            Base.prototype.onInit.call(this);

            const oCurrentUser = this.getCurrentUser();
            if (!oCurrentUser) {
                this.showError("error.loginRequired");
                this.oRouter.navTo("login");
                return;
            }
            
            const oDetailModel = Models.createDetailModel();
            this.setModel(oDetailModel, "detailModel");

            const oPageModel = Models.createPageModel(true);
            this.setModel(oPageModel, "pageModel");

            const oFilterModel = Models.createTaskDetailsFilterModel();
            this.setModel(oFilterModel, "filterModel");
            oFilterModel.attachPropertyChange(this._onFilterChange.bind(this), this);

            const bIsManager = oCurrentUser.role === "MANAGER";
            oDetailModel.setProperty("/isManager", bIsManager);
            
            // Get the request ID from the route - this will be triggered on navigation AND on page reload
            const oRoute = this.oRouter.getRoute("taskDetails");
            if (oRoute) {
                oRoute.attachPatternMatched(this._onRouteMatched, this);
                
                // Also check if we're already on this route (for page reload scenarios)
                // Use setTimeout to ensure router is fully initialized
                setTimeout(function() {
                    const oHashChanger = sap.ui.core.routing.HashChanger.getInstance();
                    const sHash = oHashChanger.getHash();
                    
                    // Check if hash matches pattern: taskDetails/{id}/{type}
                    if (sHash && sHash.indexOf("taskDetails/") === 0) {
                        const oMatch = sHash.match(/^taskDetails\/([^\/]+)\/([^\/]+)/);
                        if (oMatch) {
                            const sTaskId = oMatch[1];
                            const sTaskType = oMatch[2];
                            
                            // Check if we already have data loaded (to avoid double loading)
                            const oDetailModel = this.getModel("detailModel");
                            const sCurrentTaskId = oDetailModel.getProperty("/taskId");
                            
                            if (sCurrentTaskId !== sTaskId) {
                                // Load task details if not already loaded
                                this._loadTaskDetails(sTaskId, sTaskType);
                            }
                        }
                    }
                }.bind(this), 100);
            }
            
            // Store table reference after view is loaded
            this.attachViewLoaded();
        },

        attachViewLoaded: function () {
            const oView = this.getView();
            if (oView && oView.byId) {
                this._oAttachmentsTable = oView.byId("attachmentsTable");
            } else {
                setTimeout(this.attachViewLoaded.bind(this), 100);
            }
        },

        _onFilterChange: function () {
            this._applyAttachmentFilters();
        },

        _applyAttachmentFilters: function () {
            if (!this._oAttachmentsTable) return;
            
            const oBinding = this._oAttachmentsTable.getBinding("items");
            if (!oBinding) return;

            const oFilterModel = this.getModel("filterModel");
            const sDescriptionQuery = oFilterModel.getProperty("/descriptionQuery") || "";
            const sCategoryFilter = oFilterModel.getProperty("/categoryFilter") || "";
            const sStatusFilter = oFilterModel.getProperty("/statusFilter") || "";

            const aFilters = [];

            if (sDescriptionQuery) {
                aFilters.push(new Filter("description", FilterOperator.Contains, sDescriptionQuery));
            }

            if (sCategoryFilter) {
                aFilters.push(new Filter("category", FilterOperator.EQ, sCategoryFilter));
            }

            if (sStatusFilter) {
                aFilters.push(new Filter("status", FilterOperator.EQ, sStatusFilter));
            }

            oBinding.filter(aFilters);
        },

        _onRouteMatched: function (oEvent) {
            const oArgs = oEvent.getParameter("arguments");
            const sTaskId = oArgs.id;
            const sTaskType = oArgs.type;
            
            if (sTaskId && sTaskType) {
                this._loadTaskDetails(sTaskId, sTaskType);
            } else {
                this.showError("error.requestIdMissing");
            }
        },

        _loadTaskDetails: function (sTaskId, sTaskType) {
            const mEndpoints = {
                "Vacation": "/vacation-requests/" + sTaskId,
                "Travel": "/travel-requests/" + sTaskId,
                "Equipment": "/equipment-requests/" + sTaskId
            };
            const sEndpoint = mEndpoints[sTaskType];
            
            if (!sEndpoint) {
                this.showError("error.unknownRequestType");
                return;
            }
            
            this.setBusy(true);
            
            this.callAPI(sEndpoint, "GET")
                .then((oResponse) => {
                    this.setBusy(false);
                    if (oResponse && oResponse.success && oResponse.data) {
                        this._displayTaskDetails(oResponse.data, sTaskType);
                    } else {
                        this.showError("error.invalidResponse", [oResponse?.message || oResponse?.error || this.getText("error.unknownError")]);
                    }
                })
                .catch((error) => {
                    this.setBusy(false);
                    this.showError("error.loadTaskDetailsFailed");
                });
        },

        _displayTaskDetails: function (oData, sType) {
            const oDetailModel = this.getModel("detailModel");
            const oCurrentUser = this.getCurrentUser();
            
            const bCanApprove = this.isManager() && oData.status === "PENDING_APPROVAL";
            const bIsOwner = oData.userId === oCurrentUser.userId;

            const oModelData = {
                taskId: oData.id,
                requestId: oData.requestId,
                type: sType,
                status: oData.status,
                submittedDate: oData.submittedDate,
                isManager: this.isManager(),
                canApprove: bCanApprove,
                isOwner: bIsOwner,
                comments: oData.comments || []
            };

            if (sType === "Vacation") {
                oModelData.from = oData.user ? `${oData.user.firstName} ${oData.user.lastName}` : "";
                oModelData.manager = oData.manager ? `${oData.manager.firstName} ${oData.manager.lastName}` : "";
                oModelData.substitute = oData.substitute ? `${oData.substitute.firstName} ${oData.substitute.lastName}` : "";
                oModelData.vacationType = oData.vacationType;
                oModelData.startDate = oData.startDate;
                oModelData.endDate = oData.endDate;
                oModelData.reason = oData.reason;
                oModelData.userId = oData.userId;
                oModelData.managerId = oData.managerId;
                oModelData.substituteId = oData.substituteId;
                oModelData.attachments = (oData.attachments || []).map(function (oAttachment) {
                    return {
                        id: oAttachment.id,
                        fileName: oAttachment.fileName,
                        fileSize: oAttachment.fileSize,
                        fileType: oAttachment.fileType,
                        description: oAttachment.description,
                        status: oAttachment.status || "APPROVED",
                        rejectionReason: oAttachment.rejectionReason || "",
                        fileUrl: oAttachment.fileUrl
                    };
                });
            } else if (sType === "Equipment") {
                const sManagerName = oData.manager?.managerName || "";
                oModelData.manager = sManagerName;
                oModelData.from = sManagerName;
                oModelData.items = oData.equipmentItems || [];
                oModelData.totalCost = oData.totalCost;
            } else if (sType === "Travel") {
                oModelData.manager = oData.manager?.managerName || "No Manager";
                oModelData.from = oData.submittedBy || "Unknown";
                oModelData.userId = oData.userId;
                oModelData.managerId = oData.managerId;
                oModelData.destination = oData.destination;
                oModelData.startDate = oData.startDate;
                oModelData.endDate = oData.endDate;
                oModelData.travelReason = oData.reason;
                
                // Combine all files into attachments with category
                const aAllAttachments = [];
                
                (oData.foodCosts || []).forEach(function (oFile) {
                    aAllAttachments.push({
                        id: oFile.id,
                        fileName: oFile.fileName,
                        fileSize: oFile.fileSize,
                        fileType: oFile.fileType,
                        description: oFile.description,
                        category: "Food Costs",
                        status: oFile.status || "PENDING",
                        rejectionReason: oFile.rejectionReason || "",
                        fileUrl: oFile.fileUrl
                    });
                });
                
                (oData.travelCosts || []).forEach(function (oFile) {
                    aAllAttachments.push({
                        id: oFile.id,
                        fileName: oFile.fileName,
                        fileSize: oFile.fileSize,
                        fileType: oFile.fileType,
                        description: oFile.description,
                        category: "Travel Costs",
                        status: oFile.status || "PENDING",
                        rejectionReason: oFile.rejectionReason || "",
                        fileUrl: oFile.fileUrl
                    });
                });
                
                (oData.stayCosts || []).forEach(function (oFile) {
                    aAllAttachments.push({
                        id: oFile.id,
                        fileName: oFile.fileName,
                        fileSize: oFile.fileSize,
                        fileType: oFile.fileType,
                        description: oFile.description,
                        category: "Stay Costs",
                        status: oFile.status || "PENDING",
                        rejectionReason: oFile.rejectionReason || "",
                        fileUrl: oFile.fileUrl
                    });
                });
                
                oModelData.attachments = aAllAttachments;
            }

            oDetailModel.setData(oModelData);
        },

        onApproveAll: function () {
            const oDetailModel = this.getModel("detailModel");
            const sTaskId = oDetailModel.getProperty("/taskId");
            const sType = oDetailModel.getProperty("/type");

            this.showConfirmation("confirm.approveRequest", function () {
                this._updateTaskStatus(sTaskId, sType, "APPROVED");
            }.bind(this));
        },

        onRejectAll: function () {
            const oDetailModel = this.getModel("detailModel");
            const sTaskId = oDetailModel.getProperty("/taskId");
            const sType = oDetailModel.getProperty("/type");
            
            const oTextArea = new sap.m.TextArea({
                width: "100%",
                rows: 4,
                placeholder: this.getText("placeholder.rejectionReason")
            });

            if (!this._rejectDialog) {
                this._rejectDialog = new sap.m.Dialog({
                    title: this.getText("dialog.titleReject"),
                    type: "Message",
                    content: [
                        new sap.m.Label({ text: this.getText("label.rejectionReason"), labelFor: oTextArea }),
                        oTextArea
                    ],
                    beginButton: new sap.m.Button({
                        text: this.getText("button.reject"),
                        type: "Reject",
                        press: () => {
                            const sReason = oTextArea.getValue();
                            if (sReason && sReason.trim()) {
                                this._updateTaskStatus(sTaskId, sType, "REJECTED", sReason);
                                this._rejectDialog.close();
                            } else {
                                this.setFieldError("rejectReasonTextArea", true, "error.rejectionReasonRequired");
                            }
                        }
                    }),
                    endButton: new sap.m.Button({
                        text: this.getText("button.cancel"),
                        press: () => this._rejectDialog.close()
                    })
                });
                this.getView().addDependent(this._rejectDialog);
            }
            
            this._rejectDialog.open();
        },

        onPartialApprove: function () {
            const oDetailModel = this.getModel("detailModel");
            const sTaskId = oDetailModel.getProperty("/taskId");
            const sType = oDetailModel.getProperty("/type");
            const aAttachments = oDetailModel.getProperty("/attachments");

            // Check if any attachments are rejected
            const bHasRejected = aAttachments.some(function (oAttachment) {
                return oAttachment.status === "REJECTED";
            });

            if (!bHasRejected) {
                this.showError("error.partialRejectRequired");
                return;
            }

            this.showConfirmation("confirm.rejectRequest", function () {
                this._updateTaskStatus(sTaskId, sType, "PARTIALLY_REJECTED", null, aAttachments);
            }.bind(this));
        },

        onApproveAttachment: function (oEvent) {
            // Stop event propagation
            oEvent.preventDefault();
            console.log("onApproveAttachment clicked");
            const oButton = oEvent.getSource();
            const oListItem = this._getListItem(oButton);
            console.log("oListItem:", oListItem);

            if (oListItem) {
                const oContext = oListItem.getBindingContext("detailModel");
                const oAttachment = oContext.getObject();
                const sPath = oContext.getPath();
                const oDetailModel = this.getModel("detailModel");
                const sTaskId = oDetailModel.getProperty("/taskId");
                const sType = oDetailModel.getProperty("/type");

                // Approve attachment
                this._updateExpenseStatus(sTaskId, sType, oAttachment, "APPROVED", null, sPath);
            }
        },

        onRejectAttachment: function (oEvent) {
            // Stop event propagation
            oEvent.preventDefault();
            const oButton = oEvent.getSource();
            const oListItem = this._getListItem(oButton);
            
            if (oListItem) {
                const oContext = oListItem.getBindingContext("detailModel");
                const oAttachment = oContext.getObject();
                const sPath = oContext.getPath();
                const oDetailModel = this.getModel("detailModel");
                const sTaskId = oDetailModel.getProperty("/taskId");
                const sType = oDetailModel.getProperty("/type");

                // Show reject dialog
                this._showRejectAttachmentDialog(sPath, oAttachment, sTaskId, sType);
            }
        },

        onSearchAttachmentsByDescription: function (oEvent) {
            const oFilterModel = this.getModel("filterModel");
            const oSearchField = oEvent.getSource();
            const sQuery = oEvent.getParameter("query") || oSearchField.getValue();
            oFilterModel.setProperty("/descriptionQuery", sQuery);
        },

        onToggleAttachmentStatus: function (oEvent) {
            // Stop event propagation
            oEvent.preventDefault();
            const oButton = oEvent.getSource();
            const oListItem = this._getListItem(oButton);
            
            if (oListItem) {
                const oContext = oListItem.getBindingContext("detailModel");
                const oAttachment = oContext.getObject();
                const sPath = oContext.getPath();
                const oDetailModel = this.getModel("detailModel");
                const sTaskId = oDetailModel.getProperty("/taskId");
                const sType = oDetailModel.getProperty("/type");

                if (oAttachment.status === "REJECTED") {
                    // Change back to approved
                    this._updateExpenseStatus(sTaskId, sType, oAttachment, "APPROVED", null, sPath);
                } else if (oAttachment.status === "APPROVED") {
                    // Reject attachment with comment
                    this._showRejectAttachmentDialog(sPath, oAttachment, sTaskId, sType);
                } else {
                    // PENDING - show approve or reject dialog
                    this._showApproveRejectDialog(sPath, oAttachment, sTaskId, sType);
                }
            }
        },

        _showRejectAttachmentDialog: function (sPath, oAttachment, sTaskId, sType) {
            const oTextArea = new sap.m.TextArea({
                id: this.createId("rejectAttachmentReason"),
                width: "100%",
                rows: 3,
                placeholder: this.getText("placeholder.rejectionReason")
            });

            if (!this._rejectAttachmentDialog) {
                this._rejectAttachmentDialog = new sap.m.Dialog({
                    title: this.getText("error.rejectAttachmentTitle", [oAttachment.fileName]),
                    type: "Message",
                    content: [
                        new sap.m.Label({ text: this.getText("label.rejectionReasonAttachment"), labelFor: oTextArea }),
                        oTextArea
                    ],
                    beginButton: new sap.m.Button({
                        text: this.getText("button.reject"),
                        type: "Reject",
                        press: () => {
                            const sReason = oTextArea.getValue();
                            if (sReason && sReason.trim()) {
                                this._updateExpenseStatus(sTaskId, sType, oAttachment, "REJECTED", sReason, sPath);
                                this._rejectAttachmentDialog.close();
                            } else {
                                this.setFieldError(this.createId("rejectAttachmentReason"), true, "error.rejectionReasonRequired");
                            }
                        }
                    }),
                    endButton: new sap.m.Button({
                        text: this.getText("button.cancel"),
                        press: () => this._rejectAttachmentDialog.close()
                    })
                });
                this.getView().addDependent(this._rejectAttachmentDialog);
            }
            
            this._rejectAttachmentDialog.setTitle(this.getText("error.rejectAttachmentTitle", [oAttachment.fileName]));
            this._rejectAttachmentDialog.open();
        },

        _showApproveRejectDialog: function (sPath, oAttachment, sTaskId, sType) {
            if (!this._approveRejectDialog) {
                this._approveRejectDialog = new sap.m.Dialog({
                    title: this.getText("error.approveRejectAttachmentTitle", [oAttachment.fileName]),
                    type: "Message",
                    content: [
                        new sap.m.Label({ text: this.getText("label.chooseAction") })
                    ],
                    beginButton: new sap.m.Button({
                        text: this.getText("button.approve"),
                        type: "Accept",
                        press: () => {
                            this._updateExpenseStatus(sTaskId, sType, oAttachment, "APPROVED", null, sPath);
                            this._approveRejectDialog.close();
                        }
                    }),
                    buttons: [
                        new sap.m.Button({
                            text: this.getText("button.reject"),
                            type: "Reject",
                            press: () => {
                                this._approveRejectDialog.close();
                                this._showRejectAttachmentDialog(sPath, oAttachment, sTaskId, sType);
                            }
                        })
                    ],
                    endButton: new sap.m.Button({
                        text: this.getText("button.cancel"),
                        press: () => this._approveRejectDialog.close()
                    })
                });
                this.getView().addDependent(this._approveRejectDialog);
            }
            
            this._approveRejectDialog.setTitle(this.getText("error.approveRejectAttachmentTitle", [oAttachment.fileName]));
            this._approveRejectDialog.open();
        },

        _updateExpenseStatus: function (sTaskId, sType, oAttachment, sStatus, sRejectionReason, sPath) {
            const oDetailModel = this.getModel("detailModel");
            
            if (sType === "Travel") {
                const sRequestId = oDetailModel.getProperty("/requestId");
                const sEndpoint = `/travel-requests/${sRequestId}/expense/${oAttachment.id}/status`;
                
                this.setBusy(true);
                
                this.callAPI(sEndpoint, "PATCH", {
                    status: sStatus,
                    rejectionReason: sRejectionReason,
                    category: oAttachment.category
                })
                .then((oResponse) => {
                    this.setBusy(false);
                    if (oResponse.success) {
                        oDetailModel.setProperty(`${sPath}/status`, sStatus);
                        oDetailModel.setProperty(`${sPath}/rejectionReason`, sRejectionReason || "");
                        this.showSuccess("success.attachmentStatus", [sStatus.toLowerCase()]);
                        this._checkAndUpdateRequestStatus();
                    }
                })
                .catch((error) => {
                    this.setBusy(false);
                    this.showError("error.updateAttachmentStatusFailed");
                });
            } else {
                oDetailModel.setProperty(`${sPath}/status`, sStatus);
                oDetailModel.setProperty(`${sPath}/rejectionReason`, sRejectionReason || "");
                MessageToast.show(`Attachment ${sStatus.toLowerCase()} successfully`);
                this._checkAndUpdateRequestStatus();
            }
        },

        onFilterAttachmentsByCategory: function (oEvent) {
            const oFilterModel = this.getModel("filterModel");
            const sSelectedCategory = oEvent.getSource().getSelectedKey();
            oFilterModel.setProperty("/categoryFilter", sSelectedCategory);
        },

        onFilterAttachmentsByStatus: function (oEvent) {
            const oFilterModel = this.getModel("filterModel");
            const sSelectedStatus = oEvent.getSource().getSelectedKey();
            oFilterModel.setProperty("/statusFilter", sSelectedStatus);
        },

        onRejectCategory: function (oEvent) {
            const oButton = oEvent.getSource();
            const sCategory = oButton.data("category");
            const oDetailModel = this.getModel("detailModel");
            const sType = oDetailModel.getProperty("/type");
            const sTaskId = oDetailModel.getProperty("/taskId");
            
            const oTextArea = new sap.m.TextArea({
                width: "100%",
                rows: 3,
                placeholder: "Enter rejection reason..."
            });

            if (!this._rejectCategoryDialog) {
                this._rejectCategoryDialog = new sap.m.Dialog({
                    title: "Reject Category: " + sCategory,
                    type: "Message",
                    content: [
                        new sap.m.Label({ text: "Please provide a reason for rejecting all " + sCategory + " attachments:", labelFor: oTextArea }),
                        oTextArea
                    ],
                    beginButton: new sap.m.Button({
                        text: "Reject All",
                        type: "Reject",
                        press: () => {
                            const sReason = oTextArea.getValue();
                            if (sReason && sReason.trim()) {
                                const aAttachments = oDetailModel.getProperty("/attachments");
                                const aCategoryAttachments = aAttachments.filter((oAttachment) => oAttachment.category === sCategory);
                                
                                if (aCategoryAttachments.length === 0) {
                                    this.showError("error.noAttachments");
                                    return;
                                }
                                
                                if (sType === "Travel") {
                                    this.setBusy(true);
                                    const sRequestId = oDetailModel.getProperty("/requestId");
                                    Promise.all(aCategoryAttachments.map((oAttachment) => 
                                        this.callAPI(`/travel-requests/${sRequestId}/expense/${oAttachment.id}/status`, "PATCH", {
                                            status: "REJECTED",
                                            rejectionReason: sReason,
                                            category: sCategory
                                        })
                                    ))
                                    .then(() => {
                                        this.setBusy(false);
                                        aAttachments.forEach((oAttachment, iIndex) => {
                                            if (oAttachment.category === sCategory) {
                                                oDetailModel.setProperty(`/attachments/${iIndex}/status`, "REJECTED");
                                                oDetailModel.setProperty(`/attachments/${iIndex}/rejectionReason`, sReason);
                                            }
                                        });
                                        this.showSuccess("success.attachmentRejected", [aCategoryAttachments.length, sCategory]);
                                        this._rejectCategoryDialog.close();
                                        this._loadTaskDetails(sTaskId, sType);
                                    })
                                    .catch(() => {
                                        this.setBusy(false);
                                        this.showError("error.rejectAttachmentsFailed");
                                    });
                                } else {
                                    let rejectedCount = 0;
                                    aAttachments.forEach((oAttachment, iIndex) => {
                                        if (oAttachment.category === sCategory) {
                                            oDetailModel.setProperty(`/attachments/${iIndex}/status`, "REJECTED");
                                            oDetailModel.setProperty(`/attachments/${iIndex}/rejectionReason`, sReason);
                                            rejectedCount++;
                                        }
                                    });
                                    this.showSuccess("success.attachmentRejected", [rejectedCount, sCategory]);
                                    this._rejectCategoryDialog.close();
                                    this._loadTaskDetails(sTaskId, sType);
                                }
                            } else {
                                this.setFieldError(this.createId("rejectCategoryReason"), true, "error.rejectionReasonRequired");
                            }
                        }
                    }),
                    endButton: new sap.m.Button({
                        text: "Cancel",
                        press: () => this._rejectCategoryDialog.close()
                    })
                });
                this.getView().addDependent(this._rejectCategoryDialog);
            }
            
            this._rejectCategoryDialog.setTitle("Reject Category: " + sCategory);
            this._rejectCategoryDialog.open();
        },

        onAddComment: function () {
            MessageBox.prompt("Enter your comment:", {
                title: "Add Comment",
                onClose: (oAction, sComment) => {
                    if (oAction === MessageBox.Action.OK && sComment) {
                        const oDetailModel = this.getModel("detailModel");
                        const aComments = oDetailModel.getProperty("/comments") || [];
                        const oCurrentUser = this.getCurrentUser();
                        
                        aComments.push({
                            content: sComment,
                            user: `${oCurrentUser.firstName} ${oCurrentUser.lastName}`,
                            createdAt: new Date().toISOString(),
                            commentType: "GENERAL"
                        });
                        
                        oDetailModel.setProperty("/comments", aComments);
                        MessageToast.show("Comment added");
                    }
                }
            });
        },

        _updateTaskStatus: function (sTaskId, sType, sStatus, sRejectionReason, aAttachments, bReloadInstead) {
            const oCurrentUser = this.getCurrentUser();
            const mEndpoints = {
                "Vacation": `/vacation-requests/${sTaskId}/status`,
                "Travel": `/travel-requests/${sTaskId}/status`,
                "Equipment": `/equipment-requests/${sTaskId}/status`
            };
            const sEndpoint = mEndpoints[sType];
            const oData = {
                status: sStatus,
                approvedBy: oCurrentUser.userId,
                ...(sRejectionReason && { rejectionReason: sRejectionReason }),
                ...(aAttachments && sStatus === "PARTIALLY_REJECTED" && { attachments: aAttachments })
            };

            this.setBusy(true);

            this.callAPI(sEndpoint, "PATCH", oData)
                .then((oResponse) => {
                    this.setBusy(false);
                    this.showSuccess("success.requestApproved", [sStatus.toLowerCase()]);
                    
                    this.publishEvent("tasks", "taskUpdated", {
                        taskId: sTaskId,
                        type: sType,
                        status: sStatus
                    });
                    
                    bReloadInstead ? this._loadTaskDetails(sTaskId, sType) : this.onNavBack();
                })
                .catch((error) => {
                    this.setBusy(false);
                    this.showError("error.updateStatusFailed");
                });
        },

        _getListItem: function (oControl) {
            let oParent = oControl.getParent();
            while (oParent && oParent.getMetadata().getName() !== "sap.m.CustomListItem" && 
                   oParent.getMetadata().getName() !== "sap.m.StandardListItem" &&
                   oParent.getMetadata().getName() !== "sap.m.ColumnListItem") {
                oParent = oParent.getParent();
            }
            return oParent;
        },

        /**
         * Forward request to another manager
         */
        onForwardRequest: function () {
            const oDetailModel = this.getModel("detailModel");
            const sType = oDetailModel.getProperty("/type");
            
            if (sType !== "Vacation") {
                MessageBox.information(this.getText("info.forwardOnlyVacation"));
                return;
            }
            
            const sTaskId = oDetailModel.getProperty("/taskId");
            const sCurrentManagerId = oDetailModel.getProperty("/managerId");
            
            // Load all managers
            this.callAPI("/users", "GET")
                .then(function (oResponse) {
                    if (oResponse.success && oResponse.data) {
                        const aManagers = oResponse.data.filter(oUser => {
                            return oUser.role === "MANAGER" && oUser.userId !== sCurrentManagerId;
                        });
                        
                        this._showForwardDialog(sTaskId, aManagers);
                    }
                }.bind(this))
                .catch(function (error) {
                    this.showError("error.loadManagersFailed");
                }.bind(this));
        },

        _showForwardDialog: function (sTaskId, aManagers) {
            if (!this._forwardDialog) {
                Fragment.load({
                    name: "taskManagement.view.fragments.ForwardDialog",
                    controller: this
                }).then((oDialog) => {
                    this._forwardDialog = oDialog;
                    this.getView().addDependent(oDialog);
                    const oForwardModel = new JSONModel({ managers: aManagers, taskId: sTaskId });
                    this._forwardDialog.setModel(oForwardModel, "forwardModel");
                    this._forwardDialog.open();
                });
            } else {
                const oForwardModel = this._forwardDialog.getModel("forwardModel");
                oForwardModel.setProperty("/managers", aManagers);
                oForwardModel.setProperty("/taskId", sTaskId);
                this._forwardDialog.open();
            }
        },

        onForwardConfirm: function () {
            const oForwardModel = this._forwardDialog.getModel("forwardModel");
            const sNewManagerId = this._forwardDialog.byId("managerSelect")?.getSelectedKey();
            const sTaskId = oForwardModel.getProperty("/taskId");
            
            if (sNewManagerId) {
                this._performForward(sTaskId, sNewManagerId);
            } else {
                this.setFieldError("managerSelect", true, "error.managerSelectFailed");
            }
            this._forwardDialog.close();
        },

        onForwardCancel: function () {
            this._forwardDialog.close();
        },

        _performForward: function (sTaskId, sNewManagerId) {
            this.setBusy(true);
            
            this.callAPI(`/vacation-requests/${sTaskId}`, "PATCH", {
                managerId: sNewManagerId
            })
                .then((oResponse) => {
                    this.setBusy(false);
                    if (oResponse.success) {
                        this.showSuccess("success.requestForwarded");
                        this._loadTaskDetails(sTaskId, "Vacation");
                    } else {
                        this.showError("error.forwardFailed");
                    }
                })
                .catch((error) => {
                    this.setBusy(false);
                    this.showError("error.forwardFailedGeneric", [error.message || this.getText("error.unknownError")]);
                });
        },

        onEditRequest: function () {
            const oDetailModel = this.getModel("detailModel");
            const sType = oDetailModel.getProperty("/type");
            const sTaskId = oDetailModel.getProperty("/taskId");
            const sStatus = oDetailModel.getProperty("/status");
            
            if (sType === "Vacation") {
                this.oRouter.navTo("vacationRequest");
            } else if (sType === "Travel") {
                // Navigate to travel request form with request ID for resubmission
                if (sStatus === "REJECTED" || sStatus === "PARTIALLY_REJECTED") {
                    // For resubmission, use the resubmit route
                    this.oRouter.navTo("TravelRequestResubmit", {
                        requestId: sTaskId,
                        mode: "resubmit"
                    });
                } else {
                    // For editing pending requests, use regular route
                    this.oRouter.navTo("TravelRequest");
                }
            } else {
                MessageBox.information(this.getText("info.editNavigation"));
            }
        },

        _checkAndUpdateRequestStatus: function () {
            const oDetailModel = this.getModel("detailModel");
            const sStatus = oDetailModel.getProperty("/status");
            const sTaskId = oDetailModel.getProperty("/taskId");
            const sType = oDetailModel.getProperty("/type");
            const aAttachments = oDetailModel.getProperty("/attachments") || [];
            
            // Only check if status is still PENDING_APPROVAL
            if (sStatus !== "PENDING_APPROVAL") {
                return;
            }
            
            // If no attachments, don't change status
            if (aAttachments.length === 0) {
                return;
            }
            
            const aApproved = aAttachments.filter(function (oAttachment) {
                return oAttachment.status === "APPROVED";
            });
            
            const aRejected = aAttachments.filter(function (oAttachment) {
                return oAttachment.status === "REJECTED";
            });
            
            const aPending = aAttachments.filter(function (oAttachment) {
                return oAttachment.status === "PENDING";
            });
            
            // If all attachments are approved and none are pending → auto-approve
            if (aApproved.length === aAttachments.length && aPending.length === 0) {
                this._updateTaskStatus(sTaskId, sType, "APPROVED", null, aAttachments, true);
                return;
            }
            
            // If all attachments are rejected → auto-reject
            if (aRejected.length === aAttachments.length && aPending.length === 0) {
                // Combine rejection reasons or use a default message
                const aRejectionReasons = aRejected
                    .map(function (oAttachment) {
                        return oAttachment.rejectionReason;
                    })
                    .filter(function (sReason) {
                        return sReason && sReason.trim();
                    });
                
                const sCombinedReason = aRejectionReasons.length > 0 
                    ? "All attachments rejected. Reasons: " + aRejectionReasons.join("; ")
                    : "All attachments were rejected";
                
                this._updateTaskStatus(sTaskId, sType, "REJECTED", sCombinedReason, aAttachments, true);
                return;
            }
            
            // If we have both approved and rejected attachments → PARTIALLY_REJECTED
            if (aApproved.length > 0 && aRejected.length > 0 && aPending.length === 0) {
                this._updateTaskStatus(sTaskId, sType, "PARTIALLY_REJECTED", "Some attachments were rejected", aAttachments, true);
                return;
            }
            
            // If there are still pending attachments, keep status as PENDING_APPROVAL
        },

        onFileReuploadChange: function (oEvent) {
            // Store the file and attachment info for upload
            const oFileUploader = oEvent.getSource();
            const oFile = oEvent.getParameter("files") && oEvent.getParameter("files")[0];
            if (oFile) {
                // File selected, ready to upload
                        this.showSuccess("success.fileSelected", [oFile.name]);
            }
        },

        onFileReuploaded: function (oEvent) {
            const sResponse = oEvent.getParameter("response");
            try {
                const oResponse = JSON.parse(sResponse);
                if (oResponse.success) {
                    this.showSuccess("success.fileUploaded");
                    // Reload task details to show updated attachments
                    const oDetailModel = this.getModel("detailModel");
                    const sTaskId = oDetailModel.getProperty("/taskId");
                    const sType = oDetailModel.getProperty("/type");
                    this._loadTaskDetails(sTaskId, sType);
                } else {
                    this.showError("error.uploadFileFailed", [oResponse.message || this.getText("error.unknownError")]);
                }
            } catch (error) {
                console.error("Error parsing upload response:", error);
                this.showError("error.uploadFileFailedGeneric");
            }
        }
    });
});
