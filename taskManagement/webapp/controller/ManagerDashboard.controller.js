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

    return BaseController.extend("taskManagement.controller.ManagerDashboard", {
        formatter: formatter,

        onInit: function () {
            BaseController.prototype.onInit.call(this);

            const oCurrentUser = this.getCurrentUser();
            if (!oCurrentUser) {
                this.showError("error.loginRequired");
                this.oRouter.navTo("login");
                return;
            }

            if (oCurrentUser.role !== "MANAGER") {
                this.showError("error.accessDenied");
                this.oRouter.navTo("userDashboard");
                return;
            }

            const oPageModel = Models.createPageModel(false);
            this.setModel(oPageModel, "pageModel");

            const oDashboardModel = Models.createDashboardModel();
            this.setModel(oDashboardModel, "dashboardModel");

            const oFilterModel = Models.createManagerDashboardFilterModel();
            this.setModel(oFilterModel, "filterModel");
            oFilterModel.attachPropertyChange(this._onFilterChange.bind(this), this);

            this.subscribeEvent("tasks", "taskSubmitted", this._onTaskSubmitted, this);
            this._loadTasks();
            this.oRouter.getRoute("managerDashboard").attachPatternMatched(this._onRouteMatched, this);
            
            // Store table reference after view is loaded
            this.attachViewLoaded();
        },

        attachViewLoaded: function () {
            const oView = this.getView();
            if (oView && oView.byId) {
                this._oPendingTasksTable = oView.byId("pendingTasksTable");
            } else {
                setTimeout(this.attachViewLoaded.bind(this), 100);
            }
        },

        _onFilterChange: function () {
            this._applyFilters();
        },

        onExit: function () {
            this.unsubscribeEvent("tasks", "taskSubmitted", this._onTaskSubmitted, this);
        },

        _onRouteMatched: function () {
            this._loadTasks();
        },

        _onTaskSubmitted: function (sChannelId, sEventId, oData) {
            this.showSuccess("info.newTaskSubmitted", [oData.requestId]);
            this._loadTasks();
        },

        _loadTasks: function () {
            const oCurrentUser = this.getCurrentUser();

            if (!oCurrentUser || !oCurrentUser.userId) {
                this.showError(oCurrentUser ? "error.userInfoIncomplete" : "error.loginRequired");
                this.setBusy(false);
                return;
            }

            this.setBusy(true);

            this._getManagerIdForUser(oCurrentUser)
                .then((sManagerId) => {
                    if (!sManagerId) {
                        this.showError("error.managerNotFound");
                        this.setBusy(false);
                        return;
                    }

                    return Promise.all([
                        this._loadVacationRequests(oCurrentUser.userId),
                        this._loadTravelRequests(sManagerId),
                        this._loadEquipmentRequests(sManagerId)
                    ]);
                })
            .then((aResults) => {
                if (!aResults) return;
                
                const aVacationTasks = aResults[0] || [];
                const aTravelTasks = aResults[1] || [];
                const aEquipmentTasks = aResults[2] || [];

                const aTasks = [...aVacationTasks, ...aTravelTasks, ...aEquipmentTasks];

                if (aTasks.length > 0) {
                    aTasks.sort((a, b) => new Date(b.submittedDate) - new Date(a.submittedDate));
                }

                this.getModel("dashboardModel").setProperty("/tasks", aTasks);
                this.setBusy(false);
            })
            .catch((error) => {
                this.setBusy(false);
                this.showError("error.loadTasksFailed", [error.message || this.getText("error.unknownError")]);
            });
        },

        _loadVacationRequests: function (sManagerId) {
            return this.callAPI(`/vacation-requests?managerId=${sManagerId}`, "GET")
                .then((oResponse) => {
                    if (oResponse.success && oResponse.data) {
                        return oResponse.data.map((oRequest) => ({
                            id: oRequest.id,
                            requestId: oRequest.requestId,
                            type: "Vacation",
                            submittedBy: oRequest.user ? `${oRequest.user.firstName} ${oRequest.user.lastName}` : "Unknown",
                            subject: `${formatter.formatVacationType(oRequest.vacationType)} - ${formatter.calculateDuration(oRequest.startDate, oRequest.endDate)}`,
                            submittedDate: oRequest.submittedDate,
                            status: oRequest.status,
                            raw: oRequest
                        }));
                    }
                    return [];
                })
                .catch(() => []);
        },

        _loadTravelRequests: function (sManagerId) {
            return this.callAPI(`/travel-requests?managerId=${sManagerId}`, "GET")
                .then((oResponse) => {
                    if (oResponse.success && oResponse.data) {
                        return oResponse.data.map((oRequest) => ({
                            id: oRequest.id,
                            requestId: oRequest.requestId,
                            type: "Travel",
                            submittedBy: oRequest.submittedBy || "Unknown",
                            subject: oRequest.destination,
                            submittedDate: oRequest.submittedDate,
                            status: oRequest.status,
                            raw: oRequest
                        }));
                    }
                    return [];
                })
                .catch(() => []);
        },

        _loadEquipmentRequests: function (sManagerId) {
            return this.callAPI(`/equipment-requests?managerId=${sManagerId}`, "GET")
                .then((oResponse) => {
                    if (oResponse.success && oResponse.data) {
                        return oResponse.data.map((oRequest) => ({
                            id: oRequest.id,
                            requestId: oRequest.requestId,
                            type: "Equipment",
                            submittedBy: oRequest.manager?.managerName || "Unknown",
                            subject: `${oRequest.totalItems} items`,
                            submittedDate: oRequest.submittedDate,
                            status: oRequest.status,
                            raw: oRequest
                        }));
                    }
                    return [];
                })
                .catch(() => []);
        },

        onRefresh: function () {
            this._loadTasks();
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
            const oSelect = oEvent.getSource();
            const sSelectedKey = oEvent.getParameter("selectedItem").getKey();
            const sId = oSelect.getId();
            
            if (sId.indexOf("typeFilter") > -1) {
                oFilterModel.setProperty("/typeFilter", sSelectedKey);
            } else if (sId.indexOf("statusFilter") > -1) {
                oFilterModel.setProperty("/statusFilter", sSelectedKey);
            }
        },

        _applyFilters: function () {
            if (!this._oPendingTasksTable) return;
            
            const oBinding = this._oPendingTasksTable.getBinding("items");
            if (!oBinding) return;

            const oFilterModel = this.getModel("filterModel");
            const sSearchQuery = oFilterModel.getProperty("/searchQuery") || "";
            const sTypeFilter = oFilterModel.getProperty("/typeFilter") || "all";
            const sStatusFilter = oFilterModel.getProperty("/statusFilter") || "all";

            const aFilters = [];

            if (sSearchQuery) {
                const oSearchFilter = new Filter({
                    filters: [
                        new Filter("requestId", FilterOperator.Contains, sSearchQuery),
                        new Filter("submittedBy", FilterOperator.Contains, sSearchQuery),
                        new Filter("subject", FilterOperator.Contains, sSearchQuery)
                    ],
                    and: false
                });
                aFilters.push(oSearchFilter);
            }

            if (sTypeFilter && sTypeFilter !== "all") {
                aFilters.push(new Filter("type", FilterOperator.EQ, sTypeFilter));
            }

            if (sStatusFilter && sStatusFilter !== "all") {
                aFilters.push(new Filter("status", FilterOperator.EQ, sStatusFilter));
            }

            oBinding.filter(aFilters);
        },

        onTaskPress: function (oEvent) {
            const oItem = oEvent.getSource();
            const oContext = oItem.getBindingContext("dashboardModel");
            const oTask = oContext.getObject();

            this._navigateToTaskDetails(oTask);
        },

        onViewDetails: function (oEvent) {
            // Stop event propagation to prevent row selection
            oEvent.preventDefault();
            
            const oButton = oEvent.getSource();
            const oListItem = this._getListItem(oButton);
            
            if (oListItem) {
                const oContext = oListItem.getBindingContext("dashboardModel");
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

        onQuickApprove: function (oEvent) {
            oEvent.preventDefault();
            const oListItem = this._getListItem(oEvent.getSource());
            
            if (oListItem) {
                const oTask = oListItem.getBindingContext("dashboardModel").getObject();
                this.showConfirmation(`Approve request ${oTask.requestId}?`, () => {
                    this._updateTaskStatus(oTask, "APPROVED");
                });
            }
        },

        onQuickReject: function (oEvent) {
            oEvent.preventDefault();
            const oListItem = this._getListItem(oEvent.getSource());
            
            if (oListItem) {
                const oTask = oListItem.getBindingContext("dashboardModel").getObject();
                MessageBox.prompt("Please provide a reason for rejection:", {
                    title: "Reject Request",
                    onClose: (oAction, sReason) => {
                        oAction === MessageBox.Action.OK && this._updateTaskStatus(oTask, "REJECTED", sReason);
                    }
                });
            }
        },

        _updateTaskStatus: function (oTask, sStatus, sReason) {
            const mEndpoints = {
                "Vacation": `/vacation-requests/${oTask.id}/status`,
                "Travel": `/travel-requests/${oTask.id}/status`,
                "Equipment": `/equipment-requests/${oTask.id}/status`
            };
            const sEndpoint = mEndpoints[oTask.type];
            const oData = {
                status: sStatus,
                approvedBy: this.getCurrentUser().userId,
                ...(sReason && { rejectionReason: sReason })
            };

            this.callAPI(sEndpoint, "PATCH", oData)
                .then(() => {
                    this.showSuccess("success.requestApproved", [sStatus.toLowerCase()]);
                    this._loadTasks();
                })
                .catch(() => {
                    this.showError("error.updateStatusFailed");
                });
        },

        _getManagerIdForUser: function (oUser) {
            if (oUser.email) {
                return this.callAPI(`/managers?email=${encodeURIComponent(oUser.email)}`, "GET")
                    .then((oResponse) => {
                        if (oResponse.success && oResponse.data?.length > 0) {
                            const oManager = oResponse.data.find((m) => m.email === oUser.email);
                            if (oManager) return oManager.managerId;
                        }
                        return this._findOrCreateManager(oUser);
                    })
                    .catch(() => this._findOrCreateManager(oUser));
            }
            return this._findOrCreateManager(oUser);
        },

        _findOrCreateManager: function (oUser) {
            return this.callAPI("/managers", "GET")
                .then((oResponse) => {
                    if (oResponse.success && oResponse.data) {
                        const oManager = oResponse.data.find((m) => m.managerId === oUser.userId || m.email === oUser.email);
                        if (oManager) return oManager.managerId;
                    }
                    return oUser.userId;
                })
                .catch(() => oUser.userId);
        },

        _getListItem: function (oControl) {
            let oParent = oControl.getParent();
            while (oParent && oParent.getMetadata && oParent.getMetadata().getName() !== "sap.m.ColumnListItem") {
                oParent = oParent.getParent();
            }
            return oParent;
        },

        onUserInfoPress: function () {
            const oUser = this.getCurrentUser();
            MessageBox.information(this.getText("info.loggedInAs", [oUser.firstName, oUser.lastName]), {
                actions: [this.getText("button.logout"), MessageBox.Action.CLOSE],
                onClose: (oAction) => {
                    oAction === this.getText("button.logout") && this.logout();
                }
            });
        }
    });
});

