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
            oFilterModel.attachPropertyChange(this._onFilterChange.bind(this), this);

            this.subscribeEvent("tasks", "taskSubmitted", this._onTaskSubmitted, this);
            this.subscribeEvent("tasks", "taskUpdated", this._onTaskUpdated, this);
            this._loadRecentTasks();
            this.oRouter.getRoute("userDashboard").attachPatternMatched(this._onRouteMatched, this);
            
            // Store list reference after view is loaded
            this.attachViewLoaded();
        },

        attachViewLoaded: function () {
            const oView = this.getView();
            if (oView && oView.byId) {
                this._oActivityFeedList = oView.byId("activityFeedList");
            } else {
                setTimeout(this.attachViewLoaded.bind(this), 100);
            }
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

            this.callAPI(`/vacation-requests?userId=${oCurrentUser.userId}&limit=4`, "GET")
                .then((oResponse) => {
                    if (oResponse.success && oResponse.data) {
                        const aTasks = oResponse.data.map((oRequest) => ({
                            id: oRequest.id,
                            requestId: oRequest.requestId,
                            type: "Vacation",
                            subject: `${formatter.formatVacationType(oRequest.vacationType)} - ${formatter.calculateDuration(oRequest.startDate, oRequest.endDate)}`,
                            submittedDate: oRequest.submittedDate,
                            status: oRequest.status,
                            raw: oRequest
                        })).slice(0, 4);

                        const aActivities = this._generateActivities(oResponse.data, oCurrentUser);
                        const oDashboardModel = this.getModel("dashboardModel");
                        oDashboardModel.setProperty("/recentTasks", aTasks);
                        oDashboardModel.setProperty("/activities", aActivities);
                    }

                    this.setBusy(false);
                })
                .catch((error) => {
                    this.setBusy(false);
                });
        },

        _generateActivities: function (aRequests, oCurrentUser) {
            const aActivities = [];

            aRequests.forEach((oRequest) => {
                aActivities.push({
                    id: `${oRequest.id}_submitted`,
                    requestId: oRequest.id,
                    requestType: "Vacation",
                    action: "SUBMITTED",
                    actorName: "You",
                    description: `Submitted ${formatter.formatVacationType(oRequest.vacationType)} request (${oRequest.requestId})`,
                    timestamp: oRequest.submittedDate
                });

                if (oRequest.status === "APPROVED" && oRequest.approvedDate) {
                    const sManagerName = oRequest.manager ? `${oRequest.manager.firstName} ${oRequest.manager.lastName}` : "Manager";
                    aActivities.push({
                        id: `${oRequest.id}_approved`,
                        requestId: oRequest.id,
                        requestType: "Vacation",
                        action: "APPROVED",
                        actorName: sManagerName,
                        description: `Approved your ${formatter.formatVacationType(oRequest.vacationType)} request (${oRequest.requestId})`,
                        timestamp: oRequest.approvedDate
                    });
                } else if (oRequest.status === "REJECTED") {
                    const sManagerName = oRequest.manager ? `${oRequest.manager.firstName} ${oRequest.manager.lastName}` : "Manager";
                    aActivities.push({
                        id: `${oRequest.id}_rejected`,
                        requestId: oRequest.id,
                        requestType: "Vacation",
                        action: "REJECTED",
                        actorName: sManagerName,
                        description: `Rejected your ${formatter.formatVacationType(oRequest.vacationType)} request (${oRequest.requestId})${oRequest.rejectionReason ? `: ${oRequest.rejectionReason}` : ""}`,
                        timestamp: oRequest.updatedAt
                    });
                } else if (oRequest.status === "PARTIALLY_REJECTED") {
                    const sManagerName = oRequest.manager ? `${oRequest.manager.firstName} ${oRequest.manager.lastName}` : "Manager";
                    aActivities.push({
                        id: `${oRequest.id}_partial`,
                        requestId: oRequest.id,
                        requestType: "Vacation",
                        action: "PARTIALLY_REJECTED",
                        actorName: sManagerName,
                        description: `Partially approved your ${formatter.formatVacationType(oRequest.vacationType)} request (${oRequest.requestId}). Some attachments need resubmission.`,
                        timestamp: oRequest.updatedAt
                    });
                }

                if (oRequest.comments?.length > 0) {
                    oRequest.comments.forEach((oComment) => {
                        const sCommentorName = oComment.user ? `${oComment.user.firstName} ${oComment.user.lastName}` : "Manager";
                        aActivities.push({
                            id: oComment.id,
                            requestId: oRequest.id,
                            requestType: "Vacation",
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
        },

        onActivityFilterChange: function (oEvent) {
            const oFilterModel = this.getModel("filterModel");
            const sSelectedKey = oEvent.getParameter("selectedItem").getKey();
            oFilterModel.setProperty("/typeFilter", sSelectedKey);
        },

        _applyActivityFilters: function () {
            if (!this._oActivityFeedList) return;
            
            const oBinding = this._oActivityFeedList.getBinding("items");
            if (!oBinding) return;

            const oFilterModel = this.getModel("filterModel");
            const sSearchQuery = oFilterModel.getProperty("/searchQuery") || "";
            const sTypeFilter = oFilterModel.getProperty("/typeFilter") || "all";

            const aFilters = [];

            if (sSearchQuery) {
                const oSearchFilter = new sap.ui.model.Filter({
                    filters: [
                        new sap.ui.model.Filter("description", sap.ui.model.FilterOperator.Contains, sSearchQuery),
                        new sap.ui.model.Filter("actorName", sap.ui.model.FilterOperator.Contains, sSearchQuery)
                    ],
                    and: false
                });
                aFilters.push(oSearchFilter);
            }

            if (sTypeFilter && sTypeFilter !== "all") {
                aFilters.push(new sap.ui.model.Filter("action", sap.ui.model.FilterOperator.EQ, sTypeFilter));
            }

            oBinding.filter(aFilters);
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
                this.getText("info.loggedInAsDetails", [oUser.firstName, oUser.lastName, formatter.formatRole(oUser.role), oUser.department || "N/A"]),
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

