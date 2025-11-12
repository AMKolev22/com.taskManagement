sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (Controller, JSONModel, MessageBox, MessageToast) {
    "use strict";

    return Controller.extend("taskManagement.controller.Base", {
        API_BASE_URL: "http://localhost:3000/api",

        onInit: function () {
            this.oRouter = this.getOwnerComponent().getRouter();
            this._initializeEventBus();
        },

        _initializeEventBus: function () {
            this.oEventBus = this.getOwnerComponent().getEventBus();
        },

        getEventBus: function () {
            return this.oEventBus || this.getOwnerComponent().getEventBus();
        },

        publishEvent: function (sChannelId, sEventId, oData) {
            this.getEventBus().publish(sChannelId, sEventId, oData);
        },

        subscribeEvent: function (sChannelId, sEventId, fnHandler, oListener) {
            this.getEventBus().subscribe(sChannelId, sEventId, fnHandler, oListener);
        },

        unsubscribeEvent: function (sChannelId, sEventId, fnHandler, oListener) {
            this.getEventBus().unsubscribe(sChannelId, sEventId, fnHandler, oListener);
        },

        onPressRoute: function (oEvent) {
            const sRoute = oEvent.getSource().data("route");
            if (sRoute) {
                this.oRouter.navTo(sRoute);
            }
        },

        onLogout: function () {
            this.logout();
        },

        onNavBack: function () {
            const oHistory = sap.ui.core.routing.History.getInstance();
            const sPreviousHash = oHistory.getPreviousHash();

            if (sPreviousHash !== undefined) {
                window.history.go(-1);
            } else {
                this.oRouter.navTo("RouteMainView", {}, true);
            }
        },

        getCurrentUser: function () {
            const oUserModel = this.getOwnerComponent().getModel("userModel");
            return oUserModel ? oUserModel.getProperty("/currentUser") : null;
        },

        setCurrentUser: function (oUser) {
            let oUserModel = this.getOwnerComponent().getModel("userModel");
            if (!oUserModel) {
                oUserModel = new JSONModel();
                this.getOwnerComponent().setModel(oUserModel, "userModel");
            }
            oUserModel.setProperty("/currentUser", oUser);
        },

        isManager: function () {
            const oUser = this.getCurrentUser();
            return oUser && oUser.role === "MANAGER";
        },

        logout: function () {
            this.setCurrentUser(null);
            this.oRouter.navTo("login");
            this.showSuccess(this.getText("success.logoutSuccess"));
        },

        callAPI: function (sEndpoint, sMethod, oData) {
            const sUrl = this.API_BASE_URL + sEndpoint;
            const bIsFormData = oData instanceof FormData;
            const oOptions = {
                method: sMethod || "GET",
                headers: bIsFormData ? {} : {
                    "Content-Type": "application/json"
                }
            };

            if (oData && (sMethod === "POST" || sMethod === "PATCH" || sMethod === "PUT")) {
                oOptions.body = bIsFormData ? oData : JSON.stringify(oData);
            }

            return fetch(sUrl, oOptions)
                .then((response) => {
                    return response.json().then((data) => {
                        if (!response.ok) {
                            const error = new Error(data.message || data.error || this.getText("error.unknownError"));
                            error.response = data;
                            error.status = response.status;
                            throw error;
                        }
                        return data;
                    });
                })
                .catch((error) => {
                    console.error("API Error:", error);
                    throw error;
                });
        },

        getText: function (sKey, aArgs) {
            const oI18nModel = this.getView().getModel("i18n");
            if (!oI18nModel) {
                return sKey;
            }
            const oResourceBundle = oI18nModel.getResourceBundle();
            if (!oResourceBundle) {
                return sKey;
            }
            return aArgs ? oResourceBundle.getText(sKey, aArgs) : oResourceBundle.getText(sKey);
        },

        showSuccess: function (sMessageKey, aArgs) {
            const bIsI18nKey = typeof sMessageKey === "string" && 
                (sMessageKey.startsWith("success.") || sMessageKey.startsWith("info."));
            const sMessage = bIsI18nKey ? this.getText(sMessageKey, aArgs) : sMessageKey;
            MessageToast.show(sMessage);
        },

        showError: function (sMessageKey, aArgs) {
            const sMessage = typeof sMessageKey === "string" && sMessageKey.startsWith("error.")
                ? this.getText(sMessageKey, aArgs)
                : sMessageKey;
            MessageBox.error(sMessage);
        },

        showConfirmation: function (sMessageKey, fnOnConfirm, aArgs) {
            const sMessage = typeof sMessageKey === "string" && sMessageKey.startsWith("confirm.")
                ? this.getText(sMessageKey, aArgs)
                : sMessageKey;
            MessageBox.confirm(sMessage, {
                onClose: (oAction) => {
                    oAction === MessageBox.Action.OK && fnOnConfirm && fnOnConfirm();
                }
            });
        },

        setFieldError: function (oField, bError, sErrorMessage) {
            if (oField && oField.setValueState) {
                oField.setValueState(bError ? "Error" : "None");
                if (sErrorMessage && bError) {
                    oField.setValueStateText(this.getText(sErrorMessage));
                } else if (!bError) {
                    oField.setValueStateText("");
                }
            }
        },

        clearFieldErrors: function (aFields) {
            if (aFields && Array.isArray(aFields)) {
                aFields.forEach((oField) => {
                    this.setFieldError(oField, false);
                });
            }
        },

        validateFields: function (aValidations) {
            // aValidations: [{field: oField, isValid: boolean, errorKey: "error.key"}]
            let bAllValid = true;
            aValidations.forEach((oValidation) => {
                if (!oValidation.isValid) {
                    this.setFieldError(oValidation.field, true, oValidation.errorKey);
                    bAllValid = false;
                } else {
                    this.setFieldError(oValidation.field, false);
                }
            });
            return bAllValid;
        },

        showMessageStrip: function (sMessageKey, sType, aArgs) {
            const oView = this.getView();
            const sMessage = this.getText(sMessageKey, aArgs);
            
            // Update model binding - MessageStrip must be defined in XML
            // Try default model first
            let oModel = oView.getModel();
            if (oModel && oModel.getProperty("/showValidationMessage") !== undefined) {
                oModel.setProperty("/showValidationMessage", true);
                oModel.setProperty("/validationMessage", sMessage);
                oModel.setProperty("/validationMessageType", sType || "Error");
            } else {
                // Try requestModel for VacationRequest
                oModel = oView.getModel("requestModel");
                if (oModel && oModel.getProperty("/showValidationMessage") !== undefined) {
                    oModel.setProperty("/showValidationMessage", true);
                    oModel.setProperty("/validationMessage", sMessage);
                    oModel.setProperty("/validationMessageType", sType || "Error");
                }
            }
        },

        hideMessageStrip: function () {
            const oView = this.getView();
            
            // Update model binding - MessageStrip must be defined in XML
            let oModel = oView.getModel();
            if (oModel && oModel.getProperty("/showValidationMessage") !== undefined) {
                oModel.setProperty("/showValidationMessage", false);
            } else {
                // Try requestModel for VacationRequest
                oModel = oView.getModel("requestModel");
                if (oModel && oModel.getProperty("/showValidationMessage") !== undefined) {
                    oModel.setProperty("/showValidationMessage", false);
                }
            }
        },

        setBusy: function (bBusy) {
            const oView = this.getView();
            if (oView) {
                oView.setBusy(bBusy);
            }
        },

        getModel: function (sName) {
            return this.getView().getModel(sName);
        },

        setModel: function (oModel, sName) {
            return this.getView().setModel(oModel, sName);
        },


        // Managers helpers
        fetchUsers: function () {
            return this.callAPI("/users", "GET").then((oResponse) => {
                if (oResponse && oResponse.success && Array.isArray(oResponse.data)) {
                    return oResponse.data;
                }
                return [];
            });
        },

        mapManagers: function (aUsers, oOptions) {
            const opts = oOptions || {};
            const aManagers = (aUsers || [])
                .filter((oUser) => oUser && oUser.role === "MANAGER")
                .map((oUser) => ({
                    key: oUser.userId,
                    name: `${oUser.firstName}`,
                    email: oUser.email
                }));
            if (opts.includePlaceholder) {
                return [{ key: 99999, name: "Select a Manager" }, ...aManagers];
            }
            return aManagers;
        },

        fetchManagersList: function (oOptions) {
            return this.fetchUsers().then((aUsers) => this.mapManagers(aUsers, oOptions));
        }
    });
});
