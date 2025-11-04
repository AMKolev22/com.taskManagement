sap.ui.define([
    "taskManagement/controller/Base.controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "taskManagement/model/models",
    "taskManagement/model/formatter"
], function (BaseController, JSONModel, Filter, FilterOperator, MessageToast, MessageBox, Models, formatter) {
    "use strict";

    return BaseController.extend("taskManagement.controller.MyTasks", {
        formatter: formatter,

        onInit: function () {
            BaseController.prototype.onInit.call(this);

            const oCurrentUser = this.getCurrentUser();
            if (!oCurrentUser) {
                this.showError("error.loginRequired");
                this.oRouter.navTo("login");
                return;
            }

            const oTasksModel = Models.createTasksModel();
            this.setModel(oTasksModel, "tasksModel");

            const oFilterModel = Models.createMyTasksFilterModel();
            this.setModel(oFilterModel, "filterModel");
            oFilterModel.attachPropertyChange(this._onFilterChange.bind(this), this);

            this.subscribeEvent("tasks", "taskSubmitted", this._onTaskUpdated, this);
            this.subscribeEvent("tasks", "taskUpdated", this._onTaskUpdated, this);
            this._loadMyTasks();
            this.oRouter.getRoute("myTasks").attachPatternMatched(this._onRouteMatched, this);
            
            // Store list reference after view is loaded
            this.attachViewLoaded();
        },

        attachViewLoaded: function () {
            const oView = this.getView();
            if (oView && oView.byId) {
                this._oMyTasksList = oView.byId("myTasksList");
            } else {
                setTimeout(this.attachViewLoaded.bind(this), 100);
            }
        },

        _onFilterChange: function () {
            this._applyFilters();
        },

        onExit: function () {
            // Unsubscribe from events
            this.unsubscribeEvent("tasks", "taskSubmitted", this._onTaskUpdated, this);
            this.unsubscribeEvent("tasks", "taskUpdated", this._onTaskUpdated, this);
        },

        _onRouteMatched: function () {
            this._loadMyTasks();
        },

        _onTaskUpdated: function () {
            this._loadMyTasks();
        },

        _loadMyTasks: function () {
            const oCurrentUser = this.getCurrentUser();

            if (!oCurrentUser || !oCurrentUser.userId) {
                console.error("No current user found");
                this.setBusy(false);
                return;
            }

            this.setBusy(true);

            Promise.all([
                this._loadVacationRequests(oCurrentUser.userId),
                this._loadTravelRequests(oCurrentUser.userId),
                this._loadEquipmentRequests(oCurrentUser.userId)
            ])
                .then((aResults) => {
                    const aTasks = [...(aResults[0] || []), ...(aResults[1] || []), ...(aResults[2] || [])];

                    if (aTasks.length > 0) {
                        aTasks.sort((a, b) => new Date(b.submittedDate) - new Date(a.submittedDate));
                    }

                    this.getModel("tasksModel").setProperty("/tasks", aTasks);
                    this.setBusy(false);
                })
                .catch((error) => {
                    this.setBusy(false);
                });
        },

        _loadVacationRequests: function (sUserId) {
            return this.callAPI(`/vacation-requests?userId=${sUserId}`, "GET")
                .then((oResponse) => {
                    if (oResponse.success && oResponse.data) {
                        return oResponse.data.map((oRequest) => ({
                            id: oRequest.id,
                            requestId: oRequest.requestId,
                            type: "Vacation",
                            subject: `${formatter.formatVacationType(oRequest.vacationType)} - ${formatter.calculateDuration(oRequest.startDate, oRequest.endDate)}`,
                            submittedDate: oRequest.submittedDate,
                            status: oRequest.status,
                            rejectionReason: oRequest.rejectionReason,
                            raw: oRequest
                        }));
                    }
                    return [];
                })
                .catch(() => []);
        },

        _loadTravelRequests: function (sUserId) {
            return this.callAPI(`/travel-requests?userId=${sUserId}`, "GET")
                .then((oResponse) => {
                    if (oResponse.success && oResponse.data) {
                        return oResponse.data.map((oRequest) => ({
                            id: oRequest.id,
                            requestId: oRequest.requestId,
                            type: "Travel",
                            subject: oRequest.destination,
                            submittedDate: oRequest.submittedDate,
                            status: oRequest.status,
                            rejectionReason: oRequest.rejectionReason,
                            raw: oRequest
                        }));
                    }
                    return [];
                })
                .catch(() => []);
        },

        _loadEquipmentRequests: function (sUserId) {
            return this.callAPI(`/equipment-requests?userId=${sUserId}`, "GET")
                .then((oResponse) => {
                    if (oResponse.success && oResponse.data) {
                        return oResponse.data.map((oRequest) => ({
                            id: oRequest.id,
                            requestId: oRequest.requestId,
                            type: "Equipment",
                            subject: `${oRequest.totalItems} items`,
                            submittedDate: oRequest.submittedDate,
                            status: oRequest.status,
                            rejectionReason: oRequest.rejectionReason,
                            raw: oRequest
                        }));
                    }
                    return [];
                })
                .catch(() => []);
        },

        onRefresh: function () {
            this._loadMyTasks();
            this.showSuccess("success.tasksRefreshed");
        },

        onSearch: function (oEvent) {
            const oFilterModel = this.getModel("filterModel");
            const oSearchField = oEvent.getSource();
            const sValue = oEvent.getParameter("query") || oSearchField.getValue();
            oFilterModel.setProperty("/searchQuery", sValue);
        },

        onFilterChange: function (oEvent) {
            const oFilterModel = this.getModel("filterModel");
            const sSelectedKey = oEvent.getParameter("selectedItem").getKey();
            oFilterModel.setProperty("/statusFilter", sSelectedKey);
        },

        _applyFilters: function () {
            if (!this._oMyTasksList) return;
            
            const oBinding = this._oMyTasksList.getBinding("items");
            if (!oBinding) return;

            const oFilterModel = this.getModel("filterModel");
            const sSearchQuery = oFilterModel.getProperty("/searchQuery") || "";
            const sStatusFilter = oFilterModel.getProperty("/statusFilter") || "all";

            const aFilters = [];

            if (sSearchQuery) {
                const oSearchFilter = new Filter({
                    filters: [
                        new Filter("requestId", FilterOperator.Contains, sSearchQuery),
                        new Filter("subject", FilterOperator.Contains, sSearchQuery)
                    ],
                    and: false
                });
                aFilters.push(oSearchFilter);
            }

            if (sStatusFilter && sStatusFilter !== "all") {
                aFilters.push(new Filter("status", FilterOperator.EQ, sStatusFilter));
            }

            oBinding.filter(aFilters);
        },

        onTaskPress: function (oEvent) {
            const oItem = oEvent.getSource();
            const oContext = oItem.getBindingContext("tasksModel");
            const oTask = oContext.getObject();

            this._navigateToTaskDetails(oTask);
        },

        onViewTaskDetails: function (oEvent) {
            const oButton = oEvent.getSource();
            const oListItem = this._getListItem(oButton);
            
            if (oListItem) {
                const oContext = oListItem.getBindingContext("tasksModel");
                const oTask = oContext.getObject();
                this._navigateToTaskDetails(oTask);
            }
        },

        _navigateToTaskDetails: function (oTask) {
            this.oRouter.navTo("taskDetails", {
                id: oTask.id,
                type: oTask.type
            });
        },

        onResubmit: function (oEvent) {
            const oListItem = this._getListItem(oEvent.getSource());
            
            if (oListItem) {
                const oTask = oListItem.getBindingContext("tasksModel").getObject();
                MessageBox.information(
                    this.getText("info.resubmitTask"),
                    {
                        title: this.getText("info.resubmitTaskTitle"),
                        actions: [this.getText("button.viewDetails"), MessageBox.Action.CLOSE],
                        onClose: (oAction) => {
                            oAction === this.getText("button.viewDetails") && this._navigateToTaskDetails(oTask);
                        }
                    }
                );
            }
        },

        _getListItem: function (oControl) {
            let oParent = oControl.getParent();
            while (oParent && oParent.getMetadata().getName() !== "sap.m.CustomListItem") {
                oParent = oParent.getParent();
            }
            return oParent;
        }
    });
});

