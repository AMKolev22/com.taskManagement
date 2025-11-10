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


            this.subscribeEvent("tasks", "taskSubmitted", this._onTaskSubmitted, this);
            this._loadTasks();
            this.oRouter.getRoute("managerDashboard").attachPatternMatched(this._onRouteMatched, this);
            
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
                this._applyFilters();
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
                            submittedBy: oRequest.user ? `${oRequest.user.firstName} ${oRequest.user.lastName}` : this.getText("label.unknown"),
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
                            submittedBy: oRequest.submittedBy || this.getText("label.unknown"),
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
                            submittedBy: oRequest.manager?.managerName || this.getText("label.unknown"),
                            subject: this.getText("text.itemsCount", [oRequest.totalItems || 0]),
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
            this._applyFilters();
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
            const oFilterModel = this.getModel("filterModel");
            const oDash = this.getModel("dashboardModel");
            const aAll = oDash.getProperty("/tasks") || [];
            const sSearchQuery = (oFilterModel.getProperty("/searchQuery") || "").toLowerCase();
            const sTypeFilter = oFilterModel.getProperty("/typeFilter") || "all";
            const sStatusFilter = oFilterModel.getProperty("/statusFilter") || "all";

            const aFiltered = aAll.filter(function (t) {
                var bMatchesSearch = !sSearchQuery || [t.requestId, t.submittedBy, t.subject]
                    .filter(Boolean)
                    .some(function (v) { return String(v).toLowerCase().indexOf(sSearchQuery) !== -1; });
                var bMatchesType = sTypeFilter === "all" || t.type === sTypeFilter;
                var bMatchesStatus = sStatusFilter === "all" || t.status === sStatusFilter;
                return bMatchesSearch && bMatchesType && bMatchesStatus;
            });

            oDash.setProperty("/filteredTasks", aFiltered);
            oDash.setProperty("/hasPending", aFiltered.some(function (t) { return t.status === "PENDING_APPROVAL"; }));
        },

        onTaskPress: function (oEvent) {
            const oItem = oEvent.getSource();
            const oContext = oItem.getBindingContext("dashboardModel");
            const oTask = oContext.getObject();

            this._navigateToTaskDetails(oTask);
        },

        onViewDetails: function (oEvent) {
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
            const oListItem = this._getListItem(oEvent.getSource());
            
            if (oListItem) {
                const oTask = oListItem.getBindingContext("dashboardModel").getObject();
                this.showConfirmation("confirm.approveRequestWithId", () => {
                    this._updateTaskStatus(oTask, "APPROVED");
                }, [oTask.requestId]);
            }
        },

        onQuickReject: function (oEvent) {
            const oListItem = this._getListItem(oEvent.getSource());
            
            if (oListItem) {
                const oTask = oListItem.getBindingContext("dashboardModel").getObject();
                MessageBox.prompt(this.getText("label.rejectionReason"), {
                    title: this.getText("dialog.titleReject"),
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
                    this.publishEvent("tasks", "taskUpdated", {
                        taskId: oTask.id,
                        type: oTask.type,
                        status: sStatus
                    });
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

