sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Label",
    "sap/m/TextArea",
    "sap/m/Text",
    "sap/m/VBox",
    "sap/ui/unified/FileUploader",
    "sap/m/BusyDialog",
    "taskManagement/controller/Base.controller",
    "taskManagement/model/models"
], function (Controller, JSONModel, MessageBox, MessageToast, Dialog, Button, Label, TextArea, Text, VBox, FileUploader, BusyDialog, BaseController, Models) {
    "use strict";

    return BaseController.extend("taskManagement.controller.TravelCost", {

        onInit: function () {
            BaseController.prototype.onInit.call(this);

            const oModel = Models.createTravelRequestModel();
            this.getView().setModel(oModel);

            this._oBusyDialog = new BusyDialog();
            this._loadManagers();
            this.oRouter.getRoute("TravelRequest").attachPatternMatched(this._onRouteMatched, this);
            this.oRouter.getRoute("TravelRequestResubmit").attachPatternMatched(this._onResubmitRouteMatched, this);
            
            // No byId caching; rely on model bindings
        },

        _onRouteMatched: function (oEvent) {
            const oModel = this.getView().getModel();
            oModel.setProperty("/isResubmission", false);
            oModel.setProperty("/originalRequestId", null);
        },

        _onResubmitRouteMatched: function (oEvent) {
            const oArgs = oEvent.getParameter("arguments");
            const sRequestId = oArgs.requestId;
            const sMode = oArgs.mode;

            if (sRequestId && sMode === "resubmit") {
                this._loadRequestForResubmission(sRequestId);
            }
        },

        _loadRequestForResubmission: function (sRequestId) {
            const oModel = this.getView().getModel();
            oModel.setProperty("/isResubmission", true);
            oModel.setProperty("/originalRequestId", sRequestId);

            this.setBusy(true);

            this.callAPI(`/travel-requests/${sRequestId}`, "GET")
                .then((oResponse) => {
                    this.setBusy(false);
                    if (oResponse && oResponse.success && oResponse.data) {
                        const oRequest = oResponse.data;
                        
                        oModel.setProperty("/destination", oRequest.destination);
                        oModel.setProperty("/startDate", oRequest.startDate);
                        oModel.setProperty("/endDate", oRequest.endDate);
                        oModel.setProperty("/reason", oRequest.reason);
                        oModel.setProperty("/selectedManager", oRequest.managerId);

                        const aRejectedFood = (oRequest.foodCosts || []).filter((oFile) => oFile.status === "REJECTED");
                        const aRejectedTravel = (oRequest.travelCosts || []).filter((oFile) => oFile.status === "REJECTED");
                        const aRejectedStay = (oRequest.stayCosts || []).filter((oFile) => oFile.status === "REJECTED");

                        const mapRejectedFile = (oFile) => ({
                            fileName: oFile.fileName,
                            description: oFile.description,
                            fileSize: oFile.fileSize,
                            fileType: oFile.fileType,
                            fileUrl: oFile.fileUrl,
                            rejectionReason: oFile.rejectionReason,
                            originalId: oFile.id
                        });

                        oModel.setProperty("/foodCosts", aRejectedFood.map(mapRejectedFile));
                        oModel.setProperty("/travelCosts", aRejectedTravel.map(mapRejectedFile));
                        oModel.setProperty("/stayCosts", aRejectedStay.map(mapRejectedFile));

                        MessageBox.information(this.getText("info.resubmitRequest"), {
                            title: this.getText("info.resubmitTitle")
                        });
                    }
                })
                .catch(() => {
                    this.setBusy(false);
                    this.showError("error.loadFailed");
                });
        },

        _loadManagers: function () {
            this.callAPI("/users", "GET")
                .then((oResponse) => {
                    if (oResponse.success && oResponse.data) {
                        const aManagers = oResponse.data
                            .filter((oUser) => oUser.role === "MANAGER")
                            .map((oUser) => ({
                                key: oUser.userId,
                                name: `${oUser.firstName} ${oUser.lastName} - ${oUser.department}`
                            }));

                        if (aManagers.length === 0) {
                            aManagers.push(
                                { key: "MGR001", name: "John Smith - Finance Manager" },
                                { key: "MGR002", name: "Sarah Johnson - Operations Manager" },
                                { key: "MGR003", name: "Michael Chen - Department Head" },
                                { key: "MGR004", name: "Emma Williams - Regional Manager" }
                            );
                        }

                        this.getView().getModel().setProperty("/managers", aManagers);
                    }
                })
                .catch(() => {
                    this.showError("error.loadManagersFailed");
                    this.getView().getModel().setProperty("/managers", [
                        { key: "MGR001", name: "John Smith - Finance Manager" },
                        { key: "MGR002", name: "Sarah Johnson - Operations Manager" },
                        { key: "MGR003", name: "Michael Chen - Department Head" },
                        { key: "MGR004", name: "Emma Williams - Regional Manager" }
                    ]);
                });
        },

        onAddFile: function (oEvent) {
            const sCategory = oEvent.getSource().data("category");
            this._currentCategory = sCategory;
            
            if (!this._oFileDialog) {
                this._oFileDialog = this._createFileUploadDialog();
            }
            
            this._oFileDialog.setTitle(`Upload ${this._getCategoryDisplayName(sCategory)}`);
            this._oFileDialog.open();
        },

        _createFileUploadDialog: function () {
            const oFileUploader = new FileUploader({
                placeholder: this.getText("placeholder.fileSelection"),
                style: "Emphasized",
                uploadOnChange: false,
                change: (oEvent) => {
                    const sFileName = oEvent.getParameter("newValue");
                    this._oFileDialogFileNameText?.setText(sFileName || this.getText("placeholder.noFileSelected"));
                }
            });

            const oFileNameText = new Text({
                text: this.getText("placeholder.noFileSelected")
            }).addStyleClass("sapUiTinyMarginTop");

            const oDescriptionArea = new TextArea({
                rows: 4,
                placeholder: this.getText("placeholder.fileDescription")
            });

            // Store references for later use
            this._oFileDialogFileUploader = oFileUploader;
            this._oFileDialogFileNameText = oFileNameText;
            this._oFileDialogDescriptionArea = oDescriptionArea;

            const oContent = new VBox({
                items: [
                    new Label({ text: this.getText("label.file"), required: true }),
                    oFileUploader,
                    oFileNameText,
                    new Label({ 
                        text: this.getText("label.description"), 
                        required: true
                    }).addStyleClass("sapUiMediumMarginTop"),
                    oDescriptionArea
                ]
            }).addStyleClass("sapUiSmallMargin");

            const oDialog = new Dialog({
                title: this.getText("dialog.titleUpload"),
                contentWidth: "500px",
                content: [oContent],
                beginButton: new Button({
                    text: this.getText("button.add"),
                    type: "Emphasized",
                    press: () => this._onFileDialogAdd()
                }),
                endButton: new Button({
                    text: this.getText("button.cancel"),
                    press: () => this._onFileDialogCancel()
                })
            });

            this.getView().addDependent(oDialog);
            return oDialog;
        },

        _onFileDialogAdd: function () {
            const oFileUploader = this._oFileDialogFileUploader;
            const oDescArea = this._oFileDialogDescriptionArea;
            const sFileName = oFileUploader.getValue();
            const sDescription = oDescArea.getValue();
            const oFile = oFileUploader.oFileUpload.files[0];
            
            let bHasError = false;
            
            if (!sFileName || !oFile) {
                this.setFieldError(oFileUploader, true, "error.fileRequiredUpload");
                bHasError = true;
            } else {
                this.setFieldError(oFileUploader, false);
            }
            
            if (!sDescription) {
                this.setFieldError(oDescArea, true, "error.descriptionRequired");
                bHasError = true;
            } else {
                this.setFieldError(oDescArea, false);
            }

            if (bHasError) {
                return;
            }

            const oModel = this.getView().getModel();
            const aFiles = oModel.getProperty(`/${this._currentCategory}`);
            
            aFiles.push({
                fileId: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                file: oFile,
                fileName: oFile.name,
                description: sDescription,
                fileSize: this._formatFileSize(oFile.size),
                fileType: oFile.type,
                category: this._currentCategory,
                index: aFiles.length
            });
            
            oModel.setProperty(`/${this._currentCategory}`, aFiles);
            this._resetFileDialog();
            this._oFileDialog.close();
            this.showSuccess("success.fileAdded");
        },
        
        _formatFileSize: function (bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return `${Math.round(bytes / Math.pow(k, i) * 100) / 100} ${sizes[i]}`;
        },

        _onFileDialogCancel: function () {
            this._resetFileDialog();
            this._oFileDialog.close();
        },

        _resetFileDialog: function () {
            const oFileUploader = this._oFileDialogFileUploader;
            const oDescArea = this._oFileDialogDescriptionArea;
            const oFileNameText = this._oFileDialogFileNameText;
            
            oFileUploader?.clear();
            oDescArea?.setValue("");
            oFileNameText?.setText(this.getText("placeholder.noFileSelected"));
            this.clearFieldErrors([oFileUploader, oDescArea]);
        },

        _getCategoryDisplayName: function (sCategory) {
            const mCategoryNames = {
                "foodCosts": this.getText("category.foodCost"),
                "travelCosts": this.getText("category.travelCost"),
                "stayCosts": this.getText("category.stayCost")
            };
            return mCategoryNames[sCategory] || this.getText("category.receipt");
        },

        onDeleteFile: function (oEvent) {
            const sCategory = oEvent.getSource().data("category");
            const iIndex = parseInt(oEvent.getSource().data("index"));
            const oModel = this.getView().getModel();
            const aFiles = oModel.getProperty(`/${sCategory}`);

            this.showConfirmation("confirm.deleteFile", () => {
                aFiles.splice(iIndex, 1);
                aFiles.forEach((item, idx) => {
                    item.index = idx;
                });
                oModel.setProperty(`/${sCategory}`, aFiles);
                this.showSuccess("success.fileRemoved");
            });
        },

        onSubmit: function () {
            const oModel = this.getView().getModel();
            const oData = oModel.getData();
            
            if (!this._validateForm(oData)) {
                return;
            }
            
            const sRequestId = `TRV-${Date.now()}`;
            this._oBusyDialog.open();
            
            this._uploadAllFiles(oData, sRequestId)
                .then((expenseData) => this._createTravelRequest(oData, sRequestId, expenseData))
                .then((data) => {
                    this._oBusyDialog.close();
                    if (data.success) {
                        this.showSuccess("success.submitTravel");
                        this._resetForm();
                    } else {
                        this.showError("error.submitFailed", [data.message || this.getText("error.unknownError")]);
                    }
                })
                .catch((error) => {
                    this._oBusyDialog.close();
                    this.showError("error.submitFailed", [error.message || this.getText("error.unknownError")]);
                });
        },
        
        _uploadAllFiles: function (oData, sRequestId) {
            const aAllFiles = [];
            const aCategoryFiles = ['foodCosts', 'travelCosts', 'stayCosts'];
            
            [oData.foodCosts, oData.travelCosts, oData.stayCosts].forEach((aFiles, iCategory) => {
                aFiles.forEach((oFile) => {
                    aAllFiles.push({
                        file: oFile.file,
                        fileName: oFile.fileName,
                        description: oFile.description,
                        category: aCategoryFiles[iCategory]
                    });
                });
            });
            
            return Promise.all(aAllFiles.map((oFileData) => 
                this._uploadSingleFile(oFileData.file, oFileData.category, oFileData.description, sRequestId)
            )).then((aResults) => {
                const oExpenseData = { foodCosts: [], travelCosts: [], stayCosts: [] };
                aResults.forEach((oResult) => {
                    oExpenseData[oResult.category].push(oResult);
                });
                return oExpenseData;
            });
        },
        
        _uploadSingleFile: function (oFile, sCategory, sDescription, sRequestId) {
            const oFormData = new FormData();
            oFormData.append("file", oFile);
            oFormData.append("category", sCategory);
            oFormData.append("description", sDescription);
            oFormData.append("requestId", sRequestId);
            
            return this.callAPI("/upload", "POST", oFormData)
                .then((data) => {
                    if (data.success) {
                        return {
                            fileName: data.data.fileName,
                            storedFileName: data.data.storedFileName,
                            description: data.data.description,
                            fileSize: data.data.fileSize,
                            fileType: data.data.fileType,
                            uploadDate: data.data.uploadDate,
                            fileUrl: data.data.fileUrl,
                            category: data.data.category
                        };
                    }
                    throw new Error(data.message || "Upload failed");
                });
        },
        
        _createTravelRequest: function (oData, sRequestId, expenseData) {
            const oSelectedManager = oData.managers.find((m) => m.key === oData.selectedManager);
            const oCurrentUser = this.getCurrentUser();
            
            const oPayload = {
                requestId: sRequestId,
                submittedDate: new Date().toISOString(),
                status: "PENDING_APPROVAL",
                submitter: {
                    userId: oCurrentUser.userId,
                    submittedBy: `${oCurrentUser.firstName} ${oCurrentUser.lastName}`,
                    submittedByEmail: oCurrentUser.email
                },
                travelInformation: {
                    destination: oData.destination,
                    startDate: oData.startDate,
                    endDate: oData.endDate,
                    reason: oData.reason,
                    duration: this._calculateDuration(oData.startDate, oData.endDate)
                },
                approvingManager: {
                    managerId: oSelectedManager.key,
                    managerName: oSelectedManager.name
                },
                expenses: expenseData,
                summary: {
                    totalFoodReceipts: expenseData.foodCosts.length,
                    totalTravelReceipts: expenseData.travelCosts.length,
                    totalStayReceipts: expenseData.stayCosts.length,
                    totalAttachments: expenseData.foodCosts.length + expenseData.travelCosts.length + expenseData.stayCosts.length
                }
            };
            
            return this.callAPI("/travel-requests", "POST", oPayload)
                .then((data) => ({ success: data.success, data: data.data, requestData: oPayload }));
        },

        _resetForm: function () {
            const oModel = this.getView().getModel();
            oModel.setProperty("/destination", "");
            oModel.setProperty("/startDate", null);
            oModel.setProperty("/endDate", null);
            oModel.setProperty("/reason", "");
            oModel.setProperty("/selectedManager", null);
            oModel.setProperty("/foodCosts", []);
            oModel.setProperty("/travelCosts", []);
            oModel.setProperty("/stayCosts", []);
        },

        _validateForm: function (oData) {
            this.hideMessageStrip();
            this.clearFieldErrors([
                this._oDestinationInput,
                this._oStartDatePicker,
                this._oEndDatePicker,
                this._oReasonTextArea,
                this._oManagerSelect
            ].filter(Boolean));
            
            const oStartDate = oData.startDate ? new Date(oData.startDate) : null;
            const oEndDate = oData.endDate ? new Date(oData.endDate) : null;
            const bDateRangeValid = oStartDate && oEndDate && oEndDate >= oStartDate;
            
            const aValidations = [
                { field: this._oDestinationInput, isValid: !!oData.destination, errorKey: "error.destinationRequired" },
                { field: this._oStartDatePicker, isValid: !!oData.startDate, errorKey: "error.dateRequired" },
                { field: this._oEndDatePicker, isValid: !!oData.endDate && bDateRangeValid, errorKey: oData.endDate && !bDateRangeValid ? "error.endDateBeforeStart" : "error.dateRequired" },
                { field: this._oReasonTextArea, isValid: !!oData.reason, errorKey: "error.reasonRequired" },
                { field: this._oManagerSelect, isValid: !!oData.selectedManager, errorKey: "error.managerRequired" }
            ].filter((oValidation) => oValidation.field); // Only validate fields that exist
            
            const bFieldsValid = this.validateFields(aValidations);
            const bHasExpenses = oData.foodCosts.length > 0 || oData.travelCosts.length > 0 || oData.stayCosts.length > 0;
            
            if (!bHasExpenses) {
                this.showMessageStrip("error.noExpenses", "Warning");
            }
            
            return bFieldsValid && bHasExpenses;
        },

        _calculateDuration: function (sStartDate, sEndDate) {
            if (!sStartDate || !sEndDate) {
                return "N/A";
            }
            const oStart = new Date(sStartDate);
            const oEnd = new Date(sEndDate);
            const iDays = Math.ceil((oEnd - oStart) / (1000 * 60 * 60 * 24)) + 1;
            return `${iDays} day${iDays !== 1 ? "s" : ""}`;
        }

    });
});
