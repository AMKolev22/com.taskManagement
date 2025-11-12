sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "taskManagement/controller/Base.controller",
    "taskManagement/model/models"
], function (Controller, JSONModel, Filter, FilterOperator, MessageToast, MessageBox, Base, Models) {
    "use strict";

    return Base.extend("taskManagement.controller.MainView", {
        API_BASE_URL: "http://localhost:3000/api",

        onInit: function () {
            Base.prototype.onInit.call(this);
            
            const oPageModel = Models.createPageModel(false);
            this.getView().setModel(oPageModel, "pageModel");
            
            const oViewModel = Models.createMainViewModel();
            this.getView().setModel(oViewModel, "viewModel");
            
            const oFilterModel = Models.createFilterModel();
            this.getView().setModel(oFilterModel, "filterModel");
            
            this._loadRequests();
            
        },

        _onFilterChange: function () {
            this._applyFilters();
        },

        _loadRequests: function () {
            this.callAPI("/requests", "GET")
                .then((data) => {
                    if (data.success && data.data) {
                        const oModel = this.getView().getModel() || new JSONModel();
                        oModel.setData({ requests: data.data, filteredRequests: data.data });
                        this.getView().setModel(oModel);
                    }
                })
                .catch(() => {
                    this.showError("error.loadRequestsFailed");
                });
        },

        onSearch: function (oEvent) {
            const oFilterModel = this.getView().getModel("filterModel");
            const oSearchField = oEvent.getSource();
            const sValue = oEvent.getParameter("query") || oSearchField.getValue();
            
            // Determine which field was changed based on source
            const sId = oSearchField.getId();
            if (sId.indexOf("titleSearchField") > -1) {
                oFilterModel.setProperty("/titleQuery", sValue);
            } else if (sId.indexOf("employeeSearchField") > -1) {
                oFilterModel.setProperty("/employeeQuery", sValue);
            }
        },

        onTypeFilter: function (oEvent) {
            const oFilterModel = this.getView().getModel("filterModel");
            const sSelectedKey = oEvent.getParameter("selectedItem").getKey();
            oFilterModel.setProperty("/typeFilter", sSelectedKey);
        },

        _applyFilters: function () {
            const oFilterModel = this.getView().getModel("filterModel");
            const oModel = this.getView().getModel();
            const aAll = (oModel && oModel.getProperty("/requests")) || [];
            const sTitleQuery = (oFilterModel.getProperty("/titleQuery") || "").toLowerCase();
            const sEmployeeQuery = (oFilterModel.getProperty("/employeeQuery") || "").toLowerCase();
            const sTypeFilter = oFilterModel.getProperty("/typeFilter") || "all";

            const aFiltered = aAll.filter(function (r) {
                let bTitle = !sTitleQuery || String(r.title || "").toLowerCase().indexOf(sTitleQuery) !== -1;
                let bEmp = !sEmployeeQuery || String(r.from || "").toLowerCase().indexOf(sEmployeeQuery) !== -1;
                let bType = sTypeFilter === "all" || r.type === sTypeFilter;
                return bTitle && bEmp && bType;
            });
            oModel.setProperty("/filteredRequests", aFiltered);
        },

        onItemSelect: function (oEvent) {
            const aSelectedItems = oEvent.getParameter("listItems");
            if (aSelectedItems?.length > 0) {
                this._handleItemSelection(aSelectedItems[0]);
            }
        },

        onItemPress: function (oEvent) {
            const oItem = oEvent.getSource();
            if (oItem) {
                this._handleItemSelection(oItem);
            }
        },

        _handleItemSelection: function (oItem) {
            if (!oItem) return;
            
            const oContext = oItem.getBindingContext();
            if (!oContext) return;
            
            const oData = oContext.getObject();
            if (!oData) return;
            
            const oViewModel = this.getView().getModel("viewModel");
            oViewModel.setProperty("/showDetail", true);
            oViewModel.setProperty("/selectedRequest", oData);
            
            MessageToast.show(`Selected: ${oData.title}`);
        },

        onViewDetails: function () {
            const oViewModel = this.getView().getModel("viewModel");
            const oSelectedRequest = oViewModel.getProperty("/selectedRequest");
            
            if (!oSelectedRequest) {
                this.showError("error.requestSelectFailed");
                return;
            }
            
            this.showSuccess("info.loadingDetails", [oSelectedRequest.title]);
            
            this.getOwnerComponent().getRouter().navTo("taskDetails", {
                id: oSelectedRequest.id,
                type: oSelectedRequest.type
            });
        },

        onCloseDetail: function () {
            const oViewModel = this.getView().getModel("viewModel");
            oViewModel.setProperty("/showDetail", false);
            oViewModel.setProperty("/selectedRequest", null);
        },

        onApprove: function (oEvent) {
            oEvent.preventDefault();
            oEvent.stopPropagation();
            
            const oListItem = this._getListItem(oEvent.getSource());
            if (oListItem) {
                const oContext = oListItem.getBindingContext();
                if (oContext) {
                    const oData = oContext.getObject();
                    this.showSuccess("success.requestApproved", ["approved"]);
                    this._updateRequestStatus(oData.id, oData.type || "Travel", "APPROVED");
                }
            }
        },

        onReject: function (oEvent) {
            oEvent.preventDefault();
            oEvent.stopPropagation();
            
            const oListItem = this._getListItem(oEvent.getSource());
            if (oListItem) {
                const oContext = oListItem.getBindingContext();
                if (oContext) {
                    const oData = oContext.getObject();
                    this.showSuccess("success.requestApproved", ["rejected"]);
                    this._updateRequestStatus(oData.id, oData.type || "Travel", "REJECTED");
                }
            }
        },

        _getListItem: function (oControl) {
            let oListItem = oControl.getParent();
            while (oListItem && oListItem.getMetadata && oListItem.getMetadata().getName() !== "sap.m.ColumnListItem") {
                oListItem = oListItem.getParent();
            }
            return oListItem;
        },

        _updateRequestStatus: function (sId, sType, sStatus) {
            if (!sId) return;

            const mEndpoints = {
                "Travel": `/travel-requests/${sId}/status`,
                "Equipment": `/equipment-requests/${sId}/status`
            };
            const sEndpoint = mEndpoints[sType];
            
            if (!sEndpoint) return;

            this.callAPI(sEndpoint, "PATCH", { status: sStatus })
                .then(() => {
                    this.showSuccess("success.requestApproved", [sStatus.toLowerCase()]);
                    this._loadRequests();
                })
                .catch(() => {
                    this.showError("error.updateStatusFailed");
                });
        }
    });
});
