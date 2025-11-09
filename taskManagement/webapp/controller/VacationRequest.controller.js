sap.ui.define([
    "taskManagement/controller/Base.controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/core/Fragment",
    "taskManagement/model/models",
    "taskManagement/model/formatter"
], function (BaseController, JSONModel, MessageToast, MessageBox, Fragment, Models, formatter) {
    "use strict";

    return BaseController.extend("taskManagement.controller.VacationRequest", {
        formatter: formatter,

        onInit: function () {
            BaseController.prototype.onInit.call(this);

            const oCurrentUser = this.getCurrentUser();
            if (!oCurrentUser) {
                this.showError("error.loginRequired");
                this.oRouter.navTo("login");
                return;
            }

            const oRequestModel = Models.createVacationRequestModel();
            this.setModel(oRequestModel, "requestModel");

            this._loadUsers();
            this.oRouter.getRoute("vacationRequest").attachPatternMatched(this._onRouteMatched, this);
            
            // Store field references after view is loaded
            this.attachViewLoaded();
        },

        attachViewLoaded: function () {
            const oView = this.getView();
            if (oView && oView.byId) {
                this._oStartDatePicker = oView.byId("startDate");
                this._oEndDatePicker = oView.byId("endDate");
                this._oManagerSelect = oView.byId("managerSelect");
                this._oSubstituteSelect = oView.byId("substituteSelect");
                this._oVacationTypeSelect = oView.byId("vacationType");
                this._oReasonTextArea = oView.byId("reason");
            } else {
                setTimeout(this.attachViewLoaded.bind(this), 100);
            }
        },

        _onRouteMatched: function () {
            const oRequestModel = this.getModel("requestModel");
            // Preserve managers/substitutes lists
            const aManagers = oRequestModel.getProperty("/managers") || [];
            const aSubstitutes = oRequestModel.getProperty("/substitutes") || [];

            oRequestModel.setProperty("/vacationType", "ANNUAL_LEAVE");
            oRequestModel.setProperty("/startDate", null);
            oRequestModel.setProperty("/endDate", null);
            oRequestModel.setProperty("/duration", "");
            oRequestModel.setProperty("/managerId", "");
            oRequestModel.setProperty("/substituteId", "");
            oRequestModel.setProperty("/reason", "");
            oRequestModel.setProperty("/paid", true);
            oRequestModel.setProperty("/managerNotAvailable", false);
            oRequestModel.setProperty("/substituteNotAvailable", false);
            oRequestModel.setProperty("/managers", aManagers);
            oRequestModel.setProperty("/substitutes", aSubstitutes);
            this._clearValidationStates();
        },

        _loadUsers: function () {
            const oCurrentUser = this.getCurrentUser();

            this.callAPI("/users", "GET")
                .then((oResponse) => {
                    if (oResponse.success && oResponse.data) {
                        const oRequestModel = this.getModel("requestModel");
                        console.log("oResponse.data", oResponse.data);
                        console.log(oResponse.data);
                        const aManagers = oResponse.data.filter((oUser) => 
                            oUser.role === "MANAGER"
                        );
                        console.log("aManagers", aManagers);  
                        // const aSubstitutes = oResponse.data.filter((oUser) => 
                        //     oUser.userId !== oCurrentUser.userId
                        // );

                        oRequestModel.setProperty("/managers", aManagers);
                        oRequestModel.setProperty("/substitutes", aManagers );
                    }
                })
        },


        onVacationTypeChange: function () {
            const oRequestModel = this.getModel("requestModel");
            const sVacationType = oRequestModel.getProperty("/vacationType");
            
            // Clear validation states
            oRequestModel.setProperty("/validation/vacationTypeState", "None");
            oRequestModel.setProperty("/validation/vacationTypeMessage", "");
            
            // Set paid/unpaid logic based on vacation type
            // Sick Leave is always paid; Annual Leave uses current switch state
            if (sVacationType === "SICK_LEAVE") {
                oRequestModel.setProperty("/paid", true);
            }
            
            // Update minDate based on vacation type
            // Planned leave types cannot start in the past
            if (this._isPlannedLeaveType(sVacationType)) {
                oRequestModel.setProperty("/minDate", new Date());
            } else {
                // For SICK_LEAVE and OTHER, allow past dates (retroactive)
                oRequestModel.setProperty("/minDate", null);
            }
            
            // Re-validate substitute requirement if dates are set
            this._updateSubstituteRequirement();
        },

        onDateChange: function () {
            const oRequestModel = this.getModel("requestModel");
            const sStartDate = oRequestModel.getProperty("/startDate");
            const sEndDate = oRequestModel.getProperty("/endDate");

            // Clear validation states
            oRequestModel.setProperty("/validation/startDateState", "None");
            oRequestModel.setProperty("/validation/startDateMessage", "");
            oRequestModel.setProperty("/validation/endDateState", "None");
            oRequestModel.setProperty("/validation/endDateMessage", "");

            if (sStartDate && sEndDate) {
                const oStartDate = new Date(sStartDate);
                const oEndDate = new Date(sEndDate);

                // Normalize dates if end date is before start date
                if (oEndDate < oStartDate) {
                    oRequestModel.setProperty("/endDate", sStartDate);
                    oRequestModel.setProperty("/duration", "");
                    this._checkAvailability();
                    return;
                }

                // Validate that planned leave types cannot start in the past
                const sVacationType = oRequestModel.getProperty("/vacationType");
                if (this._isPlannedLeaveType(sVacationType)) {
                    const oToday = new Date();
                    oToday.setHours(0, 0, 0, 0);
                    
                    if (oStartDate < oToday) {
                        oRequestModel.setProperty("/validation/startDateState", "Error");
                        oRequestModel.setProperty("/validation/startDateMessage", "Start date cannot be in the past for planned leave");
                        if (this._oStartDatePicker) {
                            this.setFieldError(this._oStartDatePicker, true, "error.startDateInPast");
                        }
                    }
                }

                oRequestModel.setProperty("/duration", formatter.calculateDuration(oStartDate, oEndDate));
                this._updateSubstituteRequirement();
                this._checkAvailability();
            } else {
                this._updateSubstituteRequirement();
            }
        },

        _checkAvailability: function () {
            const oRequestModel = this.getModel("requestModel");
            const sStartDate = oRequestModel.getProperty("/startDate");
            const sEndDate = oRequestModel.getProperty("/endDate");
            const sManagerId = oRequestModel.getProperty("/managerId");
            const sSubstituteId = oRequestModel.getProperty("/substituteId");

            if (!sStartDate || !sEndDate) {
                return;
            }

            const oStartDate = new Date(sStartDate);
            const oEndDate = new Date(sEndDate);

            // Check manager availability
            if (sManagerId) {
                this._checkUserAvailability(sManagerId, oStartDate, oEndDate, "manager");
            }

            // Check substitute availability
            if (sSubstituteId) {
                this._checkUserAvailability(sSubstituteId, oStartDate, oEndDate, "substitute");
            }
        },

        _checkUserAvailability: function (sUserId, oStartDate, oEndDate, sUserType) {
            this.callAPI("/availability/check", "POST", {
                userId: sUserId,
                startDate: oStartDate.toISOString(),
                endDate: oEndDate.toISOString()
            })
            .then((oResponse) => {
                const oRequestModel = this.getModel("requestModel");
                
                if (oResponse.success) {
                    const bAvailable = oResponse.data.available;
                    const sProperty = sUserType === "manager" ? "/managerNotAvailable" : "/substituteNotAvailable";
                    oRequestModel.setProperty(sProperty, !bAvailable);

                    if (!bAvailable) {
                        const sMessageKey = sUserType === "manager" ? "error.managerNotAvailableMessage" : "error.substituteNotAvailableMessage";
                        this.showSuccess(sMessageKey);
                    }
                }
            })
            .catch(() => {
                const oRequestModel = this.getModel("requestModel");
                const sProperty = sUserType === "manager" ? "/managerNotAvailable" : "/substituteNotAvailable";
                oRequestModel.setProperty(sProperty, false);
            });
        },

        onManagerChange: function () {
            const oRequestModel = this.getModel("requestModel");
            oRequestModel.setProperty("/validation/managerState", "None");
            oRequestModel.setProperty("/validation/managerMessage", "");
            this._checkAvailability();

            // Load sidebar calendar for selected manager
            const sManagerId = oRequestModel.getProperty("/managerId");
            if (sManagerId) {
                this._loadCalendarDataToView(sManagerId, "Manager Availability");
                const oDSC = this.byId("vacationDSC");
                if (oDSC) { oDSC.setShowSideContent(true); }
            }
        },

        onSubstituteChange: function () {
            const oRequestModel = this.getModel("requestModel");
            oRequestModel.setProperty("/validation/substituteState", "None");
            oRequestModel.setProperty("/validation/substituteMessage", "");
            this._checkAvailability();
        },

        onPaidChange: function (oEvent) {
            const oRequestModel = this.getModel("requestModel");
            const bState = oEvent.getParameter("state");
            oRequestModel.setProperty("/paid", bState);
        },

        onViewManagerCalendar: function () {
            const oRequestModel = this.getModel("requestModel");
            const sManagerId = oRequestModel.getProperty("/managerId");
            
            if (!sManagerId) {
                this.setFieldError(this._oManagerSelect, true, "error.managerRequiredFirst");
                return;
            }

            // Show in side panel calendar
            this._loadCalendarDataToView(sManagerId, "Manager Availability");
            const oDSC = this.byId("vacationDSC");
            if (oDSC) { oDSC.setShowSideContent(true); }
        },

        onViewSubstituteCalendar: function () {
            const oRequestModel = this.getModel("requestModel");
            const sSubstituteId = oRequestModel.getProperty("/substituteId");
            
            if (!sSubstituteId) {
                this.setFieldError(this._oSubstituteSelect, true, "error.substituteRequiredFirst");
                return;
            }

            this._showCalendar(sSubstituteId, "Substitute");
        },

        _showCalendar: function (sUserId, sTitle) {
            if (!this._oCalendarDialog) {
                Fragment.load({
                    name: "taskManagement.view.fragments.CalendarDialog",
                    controller: this
                }).then((oDialog) => {
                    this._oCalendarDialog = oDialog;
                    this.getView().addDependent(oDialog);
                    this._loadCalendarData(sUserId, sTitle);
                    this._oCalendarDialog.open();
                });
            } else {
                this._loadCalendarData(sUserId, sTitle);
                this._oCalendarDialog.open();
            }
        },

        _loadCalendarData: function (sUserId, sTitle) {
            this.callAPI(`/availability?userId=${sUserId}`, "GET")
                .then((oResponse) => {
                    if (oResponse.success && oResponse.data) {
                        const oCalendarModel = Models.createCalendarModel(`${sTitle} Availability`, sUserId, oResponse.data);
                        this._oCalendarDialog.setModel(oCalendarModel, "calendarModel");
                    }
                })
                .catch(() => {
                    this.showError("error.loadCalendarFailed");
                });
        },

        _loadCalendarDataToView: function (sUserId, sTitle) {
            this.callAPI(`/availability?userId=${sUserId}`, "GET")
                .then((oResponse) => {
                    if (oResponse.success && oResponse.data) {
                        const oCalendarModel = Models.createCalendarModel(sTitle || "", sUserId, oResponse.data);
                        this.getView().setModel(oCalendarModel, "calendarModel");
                    }
                })
                .catch(() => {
                    // Non-blocking
                });
        },

        onCloseCalendar: function () {
            if (this._oCalendarDialog) {
                this._oCalendarDialog.close();
            }
            const oDSC = this.byId("vacationDSC");
            if (oDSC) { oDSC.setShowSideContent(false); }
        },

        // Attachment handlers removed (no attachments on new Vacation requests)

        onSubmit: function () {
            const oRequestModel = this.getModel("requestModel");
            const oCurrentUser = this.getCurrentUser();

            // Validate form
            if (!this._validateForm()) {
                return;
            }

            const sVacationType = oRequestModel.getProperty("/vacationType");
            const sStartDate = oRequestModel.getProperty("/startDate");
            const sEndDate = oRequestModel.getProperty("/endDate");
            const sManagerId = oRequestModel.getProperty("/managerId");
            const sSubstituteId = oRequestModel.getProperty("/substituteId");
            const sReason = oRequestModel.getProperty("/reason");
            const bPaid = oRequestModel.getProperty("/paid");
            const bManagerNotAvailable = oRequestModel.getProperty("/managerNotAvailable");
            const bSubstituteNotAvailable = oRequestModel.getProperty("/substituteNotAvailable");

            if (bManagerNotAvailable) {
                this.showMessageStrip("error.managerNotAvailable", "Error");
            }

            if (bSubstituteNotAvailable) {
                this.showMessageStrip("error.substituteNotAvailable", "Error");
            }

            if (bManagerNotAvailable || bSubstituteNotAvailable) {
                return;
            }

            this.setBusy(true);

            const sRequestId = `VAC-${Date.now()}`;
            const oRequestData = {
                requestId: sRequestId,
                userId: oCurrentUser.userId,
                vacationType: sVacationType,
                startDate: new Date(sStartDate).toISOString(),
                endDate: new Date(sEndDate).toISOString(),
                managerId: sManagerId,
                substituteId: sSubstituteId || null,
                reason: sReason,
                paid: bPaid,
                status: "PENDING_APPROVAL"
            };

            this.callAPI("/vacation-requests", "POST", oRequestData)
                .then((oResponse) => {
                    this.setBusy(false);
                    if (oResponse.success) {
                        this.showSuccess("success.submitVacation");
                        this.publishEvent("tasks", "taskSubmitted", { requestId: sRequestId, type: "Vacation" });
                        this.onNavBack();
                    } else {
                        this.showError("error.submitVacationFailed");
                    }
                })
                .catch(() => {
                    this.setBusy(false);
                    this.showError("error.submitVacationFailed");
                });
        },

        onCancel: function () {
            this.showConfirmation("confirm.cancelForm", () => {
                this.onNavBack();
            });
        },

        _clearValidationStates: function () {
            const oRequestModel = this.getModel("requestModel");
            oRequestModel.setProperty("/validation/vacationTypeState", "None");
            oRequestModel.setProperty("/validation/vacationTypeMessage", "");
            oRequestModel.setProperty("/validation/startDateState", "None");
            oRequestModel.setProperty("/validation/startDateMessage", "");
            oRequestModel.setProperty("/validation/endDateState", "None");
            oRequestModel.setProperty("/validation/endDateMessage", "");
            oRequestModel.setProperty("/validation/managerState", "None");
            oRequestModel.setProperty("/validation/managerMessage", "");
            oRequestModel.setProperty("/validation/substituteState", "None");
            oRequestModel.setProperty("/validation/substituteMessage", "");
            oRequestModel.setProperty("/validation/reasonState", "None");
            oRequestModel.setProperty("/validation/reasonMessage", "");
        },

        _isPlannedLeaveType: function (sVacationType) {
            // Only Annual Leave is considered planned in this form
            return sVacationType === "ANNUAL_LEAVE";
        },

        _requiresSubstitute: function (sVacationType, sStartDate, sEndDate) {
            // Sick Leave: require substitute only if duration > 3 days
            if (!sStartDate || !sEndDate) {
                return false;
            }

            const iDurationDays = formatter.calculateDurationDays(sStartDate, sEndDate);
            if (sVacationType === "SICK_LEAVE") {
                return iDurationDays > 3;
            }

            // Annual Leave: manager only by default
            return false;
        },

        _updateSubstituteRequirement: function () {
            const oRequestModel = this.getModel("requestModel");
            const sVacationType = oRequestModel.getProperty("/vacationType");
            const sStartDate = oRequestModel.getProperty("/startDate");
            const sEndDate = oRequestModel.getProperty("/endDate");
            
            const bRequiresSubstitute = this._requiresSubstitute(sVacationType, sStartDate, sEndDate);
            
            // Clear substitute if it's no longer required
            if (!bRequiresSubstitute && oRequestModel.getProperty("/substituteId")) {
                // Keep the substituteId but it's not required
            }
        },

        _validateForm: function () {
            const oRequestModel = this.getModel("requestModel");
            const oData = oRequestModel.getData();

            let bIsValid = true;
            this._clearValidationStates();

            // Validate vacation type
            if (!oData.vacationType) {
                oRequestModel.setProperty("/validation/vacationTypeState", "Error");
                oRequestModel.setProperty("/validation/vacationTypeMessage", "Vacation type is required");
                if (this._oVacationTypeSelect) {
                    this.setFieldError(this._oVacationTypeSelect, true, "error.fieldRequired");
                }
                bIsValid = false;
            }

            // Validate start date
            if (!oData.startDate) {
                oRequestModel.setProperty("/validation/startDateState", "Error");
                oRequestModel.setProperty("/validation/startDateMessage", "Start date is required");
                if (this._oStartDatePicker) {
                    this.setFieldError(this._oStartDatePicker, true, "error.dateRequired");
                }
                bIsValid = false;
            }

            // Validate end date
            if (!oData.endDate) {
                oRequestModel.setProperty("/validation/endDateState", "Error");
                oRequestModel.setProperty("/validation/endDateMessage", "End date is required");
                if (this._oEndDatePicker) {
                    this.setFieldError(this._oEndDatePicker, true, "error.dateRequired");
                }
                bIsValid = false;
            }

            // Validate date range
            if (oData.startDate && oData.endDate) {
                const dFromDate = new Date(oData.startDate);
                const dToDate = new Date(oData.endDate);

                if (dFromDate > dToDate) {
                    oRequestModel.setProperty("/validation/endDateState", "Error");
                    oRequestModel.setProperty("/validation/endDateMessage", "End date must be after start date");
                    if (this._oEndDatePicker) {
                        this.setFieldError(this._oEndDatePicker, true, "error.endDateBeforeStartDate");
                    }
                    bIsValid = false;
                }

                // Validate that planned leave types cannot start in the past
                if (this._isPlannedLeaveType(oData.vacationType)) {
                    const dToday = new Date();
                    dToday.setHours(0, 0, 0, 0);

                    if (dFromDate < dToday) {
                        oRequestModel.setProperty("/validation/startDateState", "Error");
                        oRequestModel.setProperty("/validation/startDateMessage", "Start date cannot be in the past for planned leave");
                        if (this._oStartDatePicker) {
                            this.setFieldError(this._oStartDatePicker, true, "error.startDateInPast");
                        }
                        bIsValid = false;
                    }
                }
            }

            // Validate manager
            if (!oData.managerId) {
                oRequestModel.setProperty("/validation/managerState", "Error");
                oRequestModel.setProperty("/validation/managerMessage", "Manager is required");
                if (this._oManagerSelect) {
                    this.setFieldError(this._oManagerSelect, true, "error.managerRequired");
                }
                bIsValid = false;
            }

            // Validate substitute - only required for planned leave types when duration > 3 days
            if (this._requiresSubstitute(oData.vacationType, oData.startDate, oData.endDate)) {
                if (!oData.substituteId) {
                    oRequestModel.setProperty("/validation/substituteState", "Error");
                    oRequestModel.setProperty("/validation/substituteMessage", "Substitute is required for planned leave longer than 3 days");
                    if (this._oSubstituteSelect) {
                        this.setFieldError(this._oSubstituteSelect, true, "error.substituteRequired");
                    }
                    bIsValid = false;
                }
            }

            // Validate reason
            if (!oData.reason || oData.reason.trim() === "") {
                oRequestModel.setProperty("/validation/reasonState", "Error");
                oRequestModel.setProperty("/validation/reasonMessage", "Reason is required");
                if (this._oReasonTextArea) {
                    this.setFieldError(this._oReasonTextArea, true, "error.reasonRequiredVacation");
                }
                bIsValid = false;
            }

            return bIsValid;
        },

        formatSubstituteRequired: function (sVacationType, sStartDate, sEndDate) {
            return this._requiresSubstitute(sVacationType, sStartDate, sEndDate);
        },

        formatShowSubstitute: function (sVacationType, sStartDate, sEndDate) {
            return this._requiresSubstitute(sVacationType, sStartDate, sEndDate);
        }
    });
});

