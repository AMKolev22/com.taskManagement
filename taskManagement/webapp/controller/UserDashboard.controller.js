sap.ui.define([
    "taskManagement/controller/Base.controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "taskManagement/model/models",
    "taskManagement/model/formatter"
], function (BaseController, JSONModel, MessageToast, MessageBox, Models, formatter) {
    "use strict";

    return BaseController.extend("taskManagement.controller.UserDashboard", {
        formatter: formatter,

        onInit: function () {
            BaseController.prototype.onInit.call(this);

            const oCurrentUser = this.getCurrentUser();
            if (!oCurrentUser) {
                this.showError("error.loginRequired");
                this.oRouter.navTo("login");
                return;
            }

            const oPageModel = Models.createPageModel(false);
            this.setModel(oPageModel, "pageModel");

            const oDashboardModel = Models.createUserDashboardModel();
            this.setModel(oDashboardModel, "dashboardModel");

            const oFilterModel = Models.createUserDashboardFilterModel();
            this.setModel(oFilterModel, "filterModel");

            this.subscribeEvent("tasks", "taskSubmitted", this._onTaskSubmitted, this);
            this.subscribeEvent("tasks", "taskUpdated", this._onTaskUpdated, this);
            this._loadRecentTasks();
            this.oRouter.getRoute("userDashboard").attachPatternMatched(this._onRouteMatched, this);
            
        },

        _onFilterChange: function () {
            this._applyActivityFilters();
        },

        onExit: function () {
            // Unsubscribe from events
            this.unsubscribeEvent("tasks", "taskSubmitted", this._onTaskSubmitted, this);
            this.unsubscribeEvent("tasks", "taskUpdated", this._onTaskUpdated, this);
        },

        _onRouteMatched: function () {
            this._loadRecentTasks();
        },

        _onTaskSubmitted: function (sChannelId, sEventId, oData) {
            this._loadRecentTasks();
        },

        _onTaskUpdated: function (sChannelId, sEventId, oData) {
            this._loadRecentTasks();
        },

        _loadRecentTasks: function () {
            const oCurrentUser = this.getCurrentUser();

            this.setBusy(true);

            Promise.all([
                this.callAPI(`/vacation-requests?userId=${oCurrentUser.userId}&limit=50`, "GET"),
                this.callAPI(`/travel-requests?userId=${oCurrentUser.userId}&limit=50`, "GET"),
                this.callAPI(`/equipment-requests?userId=${oCurrentUser.userId}&limit=50`, "GET")
            ])
                .then(([oVac, oTrav, oEquip]) => {
                    const aVac = (oVac && oVac.success && Array.isArray(oVac.data)) ? oVac.data : [];
                    const aTrav = (oTrav && oTrav.success && Array.isArray(oTrav.data)) ? oTrav.data : [];
                    const aEquip = (oEquip && oEquip.success && Array.isArray(oEquip.data)) ? oEquip.data : [];

                    // Build Recent Tasks (top 4 across all types)
                    const aVacationTasks = aVac.map((oRequest) => ({
                        id: oRequest.id,
                        requestId: oRequest.requestId,
                        type: "Vacation",
                        subject: `${formatter.formatVacationType(oRequest.vacationType)} - ${formatter.calculateDuration(oRequest.startDate, oRequest.endDate)}`,
                        submittedDate: oRequest.submittedDate,
                        status: oRequest.status,
                        raw: oRequest
                    }));

                    const aTravelTasks = aTrav.map((oRequest) => ({
                        id: oRequest.id,
                        requestId: oRequest.requestId,
                        type: "Travel",
                        subject: oRequest.destination,
                        submittedDate: oRequest.submittedDate,
                        status: oRequest.status,
                        raw: oRequest
                    }));

                    const aEquipmentTasks = aEquip.map((oRequest) => ({
                        id: oRequest.id,
                        requestId: oRequest.requestId,
                        type: "Equipment",
                        subject: `${oRequest.totalItems} items`,
                        submittedDate: oRequest.submittedDate,
                        status: oRequest.status,
                        raw: oRequest
                    }));

                    let aTasks = [...aVacationTasks, ...aTravelTasks, ...aEquipmentTasks];
                    if (aTasks.length > 0) {
                        aTasks.sort((a, b) => new Date(b.submittedDate) - new Date(a.submittedDate));
                    }
                    aTasks = aTasks.slice(0, 4);

                    // Build Activity Log from all request types
                    const aAllRaw = [
                        ...aVac.map((r) => ({ ...r, __type: "Vacation" })),
                        ...aTrav.map((r) => ({ ...r, __type: "Travel" })),
                        ...aEquip.map((r) => ({ ...r, __type: "Equipment" }))
                    ];
                    const aActivities = this._generateActivities(aAllRaw, oCurrentUser);

                    const oDashboardModel = this.getModel("dashboardModel");
                    oDashboardModel.setProperty("/recentTasks", aTasks);
                    oDashboardModel.setProperty("/activities", aActivities);
                    // Initialize filtered with full set then apply filters
                    oDashboardModel.setProperty("/activitiesFiltered", aActivities);
                    this._applyActivityFilters();

                    this.setBusy(false);
                })
                .catch(() => {
                    this.setBusy(false);
                });
        },

        _generateActivities: function (aRequests, oCurrentUser) {
            const aActivities = [];

            aRequests.forEach((oRequest) => {
                const sType = oRequest.__type || "Vacation";

                // Submitted entry
                let sSubmitDesc = "";
                if (sType === "Vacation") {
                    sSubmitDesc = `Submitted ${formatter.formatVacationType(oRequest.vacationType)} request (${oRequest.requestId})`;
                } else if (sType === "Travel") {
                    sSubmitDesc = `Submitted travel request to ${oRequest.destination} (${oRequest.requestId})`;
                } else if (sType === "Equipment") {
                    sSubmitDesc = `Submitted equipment request (${oRequest.requestId})`;
                }

                aActivities.push({
                    id: `${oRequest.id}_${sType}_submitted`,
                    requestId: oRequest.id,
                    requestType: sType,
                    action: "SUBMITTED",
                    actorName: "You",
                    description: sSubmitDesc,
                    timestamp: oRequest.submittedDate
                });

                // Status-based entries
                let sManagerName = "Manager";
                if (oRequest.manager) {
                    if (sType === "Vacation") {
                        sManagerName = oRequest.manager.firstName || oRequest.manager.managerName || "Manager";
                    } else {
                        const sRaw = oRequest.manager.managerName || oRequest.manager.firstName || "Manager";
                        sManagerName = String(sRaw).trim().split(/\s+/)[0] || "Manager";
                    }
                }
                if (oRequest.status === "APPROVED" && oRequest.approvedDate) {
                    let sDesc = "";
                    if (sType === "Vacation") {
                        sDesc = `Approved your ${formatter.formatVacationType(oRequest.vacationType)} request (${oRequest.requestId})`;
                    } else if (sType === "Travel") {
                        sDesc = `Approved your travel request (${oRequest.requestId})`;
                    } else if (sType === "Equipment") {
                        sDesc = `Approved your equipment request (${oRequest.requestId})`;
                    }
                    aActivities.push({
                        id: `${oRequest.id}_${sType}_approved`,
                        requestId: oRequest.id,
                        requestType: sType,
                        action: "APPROVED",
                        actorName: sManagerName,
                        description: sDesc,
                        timestamp: oRequest.approvedDate
                    });
                } else if (oRequest.status === "REJECTED") {
                    let sDesc = "";
                    if (sType === "Vacation") {
                        sDesc = `Rejected your ${formatter.formatVacationType(oRequest.vacationType)} request (${oRequest.requestId})${oRequest.rejectionReason ? `: ${oRequest.rejectionReason}` : ""}`;
                    } else if (sType === "Travel") {
                        sDesc = `Rejected your travel request (${oRequest.requestId})${oRequest.rejectionReason ? `: ${oRequest.rejectionReason}` : ""}`;
                    } else if (sType === "Equipment") {
                        sDesc = `Rejected your equipment request (${oRequest.requestId})${oRequest.rejectionReason ? `: ${oRequest.rejectionReason}` : ""}`;
                    }
                    aActivities.push({
                        id: `${oRequest.id}_${sType}_rejected`,
                        requestId: oRequest.id,
                        requestType: sType,
                        action: "REJECTED",
                        actorName: sManagerName,
                        description: sDesc,
                        timestamp: oRequest.updatedAt
                    });
                } else if (oRequest.status === "PARTIALLY_REJECTED") {
                    let sDesc = "";
                    if (sType === "Vacation") {
                        sDesc = `Partially approved your ${formatter.formatVacationType(oRequest.vacationType)} request (${oRequest.requestId}). Some attachments need resubmission.`;
                    } else if (sType === "Travel") {
                        sDesc = `Partially approved your travel request (${oRequest.requestId}). Some items need attention.`;
                    } else if (sType === "Equipment") {
                        sDesc = `Partially approved your equipment request (${oRequest.requestId}). Some items need resubmission.`;
                    }
                    aActivities.push({
                        id: `${oRequest.id}_${sType}_partial`,
                        requestId: oRequest.id,
                        requestType: sType,
                        action: "PARTIALLY_REJECTED",
                        actorName: sManagerName,
                        description: sDesc,
                        timestamp: oRequest.updatedAt
                    });
                }

                // Comments (available for Vacation requests)
                if (sType === "Vacation" && oRequest.comments?.length > 0) {
                    oRequest.comments.forEach((oComment) => {
                        const sCommentorName = oComment.user ? `${oComment.user.firstName}` : "Manager";
                        aActivities.push({
                            id: oComment.id,
                            requestId: oRequest.id,
                            requestType: sType,
                            action: "COMMENT",
                            actorName: sCommentorName,
                            description: `Added a comment: ${oComment.content}`,
                            timestamp: oComment.createdAt
                        });
                    });
                }
            });

            aActivities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            return aActivities;
        },

        onRefresh: function () {
            this._loadRecentTasks();
            this.showSuccess("success.dashboardRefreshed");
        },

        onNewVacationRequest: function () {
            this.oRouter.navTo("vacationRequest");
        },

        onViewAllTasks: function () {
            this.oRouter.navTo("myTasks");
        },

        onTaskPress: function (oEvent) {
            const oItem = oEvent.getSource();
            const oContext = oItem.getBindingContext("dashboardModel");
            const oTask = oContext.getObject();

            this._navigateToTaskDetails(oTask);
        },

        onViewTaskDetails: function (oEvent) {
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

        _getListItem: function (oControl) {
            let oParent = oControl.getParent();
            while (oParent && oParent.getMetadata().getName() !== "sap.m.CustomListItem") {
                oParent = oParent.getParent();
            }
            return oParent;
        },

        onActivitySearch: function (oEvent) {
            const oFilterModel = this.getModel("filterModel");
            const oSearchField = oEvent.getSource();
            const sValue = oEvent.getParameter("query") || oSearchField.getValue();
            oFilterModel.setProperty("/searchQuery", sValue);
            this._applyActivityFilters();
        },

        onActivityFilterChange: function (oEvent) {
            const oFilterModel = this.getModel("filterModel");
            const sSelectedKey = oEvent.getParameter("selectedItem").getKey();
            oFilterModel.setProperty("/typeFilter", sSelectedKey);
            this._applyActivityFilters();
        },

        _applyActivityFilters: function () {
            const oFilterModel = this.getModel("filterModel");
            const oDashboardModel = this.getModel("dashboardModel");
            const aAll = oDashboardModel.getProperty("/activities") || [];
            const sSearchQuery = (oFilterModel.getProperty("/searchQuery") || "").toLowerCase();
            const sTypeFilter = oFilterModel.getProperty("/typeFilter") || "all";

            const aFiltered = aAll.filter(function (a) {
                var bSearch = !sSearchQuery || [a.description, a.actorName]
                    .filter(Boolean)
                    .some(function (v) { return String(v).toLowerCase().indexOf(sSearchQuery) !== -1; });
                var bType = sTypeFilter === "all" || a.action === sTypeFilter;
                return bSearch && bType;
            });

            oDashboardModel.setProperty("/activitiesFiltered", aFiltered);
        },

        onActivityPress: function (oEvent) {
            const oSource = oEvent.getSource();
            const sRequestId = oSource.data("requestId");
            const sRequestType = oSource.data("requestType");

            if (sRequestId && sRequestType) {
                this.oRouter.navTo("taskDetails", {
                    id: sRequestId,
                    type: sRequestType
                });
            }
        },

        onUserInfoPress: function () {
            const oUser = this.getCurrentUser();
            MessageBox.information(
                this.getText("info.loggedInAsDetails", [oUser.firstName, formatter.formatRole(oUser.role), oUser.department || "N/A"]),
                {
                    actions: [this.getText("button.logout"), MessageBox.Action.CLOSE],
                    onClose: (oAction) => {
                        oAction === this.getText("button.logout") && this.logout();
                    }
                }
            );
        }
    });
});

