sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "taskManagement/controller/Base.controller",
    "taskManagement/model/models"
], function (Controller, JSONModel, MessageBox, MessageToast, Base, Models) {
    "use strict";

    return Base.extend("taskManagement.controller.EquipmentRequest", {

        onInit: function () {
            Base.prototype.onInit.call(this);
            
            const oModel = Models.createEquipmentRequestModel();
            oModel.setProperty("/filteredCatalogItems", oModel.getProperty("/catalogItems"));
            this.getView().setModel(oModel);
            
        },

        onOpenCatalogDialog: function () {
            const oModel = this.getView().getModel();
            oModel.setProperty("/filterType", "");
            oModel.setProperty("/searchQuery", "");
            oModel.setProperty("/sortBy", "");
            oModel.setProperty("/sortOrder", "asc");
            oModel.setProperty("/selectedCatalogIds", []);
            
            this._applyFiltersAndSort();
            
            var oTable = this.byId && this.byId("catalogTable");
            if (oTable) { oTable.removeSelections(true); }
            var oDialog = this.byId && this.byId("catalogDialog");
            if (oDialog) { oDialog.open(); }
        },

        onCloseCatalogDialog: function () {
            var oDialog = this.byId && this.byId("catalogDialog");
            if (oDialog) { oDialog.close(); }
        },

        onFilterCatalog: function () {
            this._saveSelection();
            this._applyFiltersAndSort();
            this._restoreSelection();
        },

        onSearchCatalog: function () {
            this._saveSelection();
            this._applyFiltersAndSort();
            this._restoreSelection();
        },

        _saveSelection: function () {
            var oTable = this.byId && this.byId("catalogTable");
            if (!oTable) return;
            const aSelectedItems = oTable.getSelectedItems();
            const oModel = this.getView().getModel();
            const aSelectedIds = aSelectedItems.map((oItem) => oItem.getBindingContext().getObject().id);

            oModel.setProperty("/selectedCatalogIds", aSelectedIds);
        },

        _restoreSelection: function () {
            var oTable = this.byId && this.byId("catalogTable");
            if (!oTable) return;
            const oModel = this.getView().getModel();
            const aSelectedIds = oModel.getProperty("/selectedCatalogIds");
            const aItems = oTable.getItems();

            oTable.removeSelections(true);

            aItems.forEach((oItem) => {
                const oData = oItem.getBindingContext().getObject();
                if (aSelectedIds.indexOf(oData.id) > -1) {
                    oTable.setSelectedItem(oItem, true);
                }
            });
        },

        _applyFiltersAndSort: function () {
            const oModel = this.getView().getModel();
            const aCatalogItems = oModel.getProperty("/catalogItems");
            const sFilterType = oModel.getProperty("/filterType");
            const sSearchQuery = oModel.getProperty("/searchQuery").toLowerCase();
            const sSortBy = oModel.getProperty("/sortBy");
            const sSortOrder = oModel.getProperty("/sortOrder");

            let aFiltered = aCatalogItems.filter((oItem) => 
                (!sFilterType || oItem.type === sFilterType) && 
                (!sSearchQuery || oItem.name.toLowerCase().indexOf(sSearchQuery) > -1)
            );

            if (sSortBy) {
                aFiltered.sort((a, b) => {
                    let valA = sSortBy === "name" ? a[sSortBy].toLowerCase() : a[sSortBy];
                    let valB = sSortBy === "name" ? b[sSortBy].toLowerCase() : b[sSortBy];
                    return sSortOrder === "asc" 
                        ? (valA > valB ? 1 : valA < valB ? -1 : 0)
                        : (valA < valB ? 1 : valA > valB ? -1 : 0);
                });
            }

            oModel.setProperty("/filteredCatalogItems", aFiltered);
        },

        onSortByName: function () {
            const oModel = this.getView().getModel();
            const sSortBy = oModel.getProperty("/sortBy");
            const sSortOrder = oModel.getProperty("/sortOrder");

            sSortBy === "name"
                ? oModel.setProperty("/sortOrder", sSortOrder === "asc" ? "desc" : "asc")
                : (oModel.setProperty("/sortBy", "name"), oModel.setProperty("/sortOrder", "asc"));

            this._saveSelection();
            this._applyFiltersAndSort();
            this._restoreSelection();
        },

        onSortByCost: function () {
            const oModel = this.getView().getModel();
            const sSortBy = oModel.getProperty("/sortBy");
            const sSortOrder = oModel.getProperty("/sortOrder");

            sSortBy === "cost"
                ? oModel.setProperty("/sortOrder", sSortOrder === "asc" ? "desc" : "asc")
                : (oModel.setProperty("/sortBy", "cost"), oModel.setProperty("/sortOrder", "asc"));

            this._saveSelection();
            this._applyFiltersAndSort();
            this._restoreSelection();
        },

        onAddSelectedItems: function () {
            var oTable = this.byId && this.byId("catalogTable");
            if (!oTable) return;
            const aSelectedItems = oTable.getSelectedItems();

            if (aSelectedItems.length === 0) {
                this.showError("error.catalogItemRequired");
                return;
            }

            const oModel = this.getView().getModel();
            const aCurrentSelected = oModel.getProperty("/selectedItems");
            const aItemsToAdd = [];

            for (const oItem of aSelectedItems) {
                const oData = oItem.getBindingContext().getObject();

                if (!oData.amount || oData.amount < 1) {
                    this.showError("error.itemAmountRequired", [oData.name]);
                    return;
                }

                if (!oData.reason || oData.reason.trim() === "") {
                    this.showError("error.itemReasonRequired", [oData.name]);
                    return;
                }

                aItemsToAdd.push({
                    id: oData.id,
                    type: oData.type,
                    name: oData.name,
                    cost: oData.cost,
                    amount: parseInt(oData.amount, 10),
                    reason: oData.reason
                });
            }

            aCurrentSelected.push(...aItemsToAdd);
            oModel.setProperty("/selectedItems", aCurrentSelected);
            this._calculateTotalCost();
            this._resetCatalogItems();

            this.showSuccess("success.itemsAdded", [aItemsToAdd.length]);
            this.onCloseCatalogDialog();
        },

        _resetCatalogItems: function () {
            const oModel = this.getView().getModel();
            const aCatalogItems = oModel.getProperty("/catalogItems");
            
            aCatalogItems.forEach((oItem) => {
                oItem.amount = 1;
                oItem.reason = "";
            });
            
            oModel.setProperty("/catalogItems", aCatalogItems);
            this._applyFiltersAndSort();
        },

        onDeleteItem: function (oEvent) {
            const oModel = this.getView().getModel();
            const aSelectedItems = oModel.getProperty("/selectedItems");
            const sPath = oEvent.getSource().getBindingContext().getPath();
            const iIndex = parseInt(sPath.split("/")[2], 10);

            this.showConfirmation("confirm.deleteItem", () => {
                aSelectedItems.splice(iIndex, 1);
                oModel.setProperty("/selectedItems", aSelectedItems);
                this._calculateTotalCost();
                this.showSuccess("success.itemRemoved");
            });
        },

        _calculateTotalCost: function () {
            const oModel = this.getView().getModel();
            const aSelectedItems = oModel.getProperty("/selectedItems");
            const fTotal = aSelectedItems.reduce((sum, oItem) => sum + oItem.cost * oItem.amount, 0);

            oModel.setProperty("/totalCost", fTotal.toFixed(2));
        },

        onSubmitRequest: function () {
            const oModel = this.getView().getModel();
            const aSelectedItems = oModel.getProperty("/selectedItems");
            const sManager = oModel.getProperty("/selectedManager");

            this.clearFieldErrors([this._oManagerSelect].filter(Boolean));

            const aValidations = [
                { field: this._oManagerSelect, isValid: !!sManager, errorKey: "error.managerRequired" }
            ].filter((oValidation) => oValidation.field);
            
            if (aSelectedItems.length === 0) {
                this.showError("error.itemsRequired");
                return;
            }

            if (!this.validateFields(aValidations)) {
                return;
            }

            const oManager = oModel.getProperty("/managers").find((m) => m.id === sManager);
            this._submitEquipmentRequest(aSelectedItems, oModel.getProperty("/totalCost"), oManager);
        },

        _submitEquipmentRequest: function (aItems, fTotalCost, oManager) {
            const sRequestId = `EQ-${Date.now()}`;
            
            const oPayload = {
                requestId: sRequestId,
                submittedDate: new Date().toISOString(),
                status: "PENDING_APPROVAL",
                approvingManager: {
                    managerId: oManager.id,
                    managerName: oManager.name
                },
                equipmentItems: aItems,
                totalCost: fTotalCost.toString()
            };

            this.callAPI("/equipment-requests", "POST", oPayload)
                .then(() => {
                    this.showSuccess("success.submitEquipment", [sRequestId]);
                    this._resetForm();
                })
                .catch((error) => {
                    this.showError("error.submitEquipmentFailed");
                });
        },

        onCancelRequest: function () {
            this.showConfirmation("confirm.cancelRequest", () => {
                this._resetForm();
            });
        },

        _resetForm: function () {
            const oModel = this.getView().getModel();
            oModel.setProperty("/selectedItems", []);
            oModel.setProperty("/selectedManager", "");
            oModel.setProperty("/totalCost", 0);
            this.showSuccess("success.formReset");
        }

    });
});
