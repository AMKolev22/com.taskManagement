sap.ui.define([
    "taskManagement/controller/Base.controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "taskManagement/model/models"
], function (BaseController, JSONModel, MessageToast, MessageBox, Models) {
    "use strict";

    return BaseController.extend("taskManagement.controller.Login", {

        onInit: function () {
            BaseController.prototype.onInit.call(this);

            const oLoginModel = Models.createLoginModel();
            this.setModel(oLoginModel, "loginModel");

            const oCurrentUser = this.getCurrentUser();
            if (oCurrentUser) {
                this._navigateToHomePage(oCurrentUser);
            }

            this.oRouter.getRoute("login").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            const oLoginModel = this.getModel("loginModel");
            oLoginModel.setProperty("/email", "");
            oLoginModel.setProperty("/password", "");
        },

        onLogin: function () {
            const oLoginModel = this.getModel("loginModel");
            const sEmail = oLoginModel.getProperty("/email");
            const sPassword = oLoginModel.getProperty("/password");

            this.clearFieldErrors(["emailInput", "passwordInput"]);

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const bEmailValid = sEmail && emailRegex.test(sEmail);
            
            const aValidations = [
                { fieldId: "emailInput", isValid: !!sEmail && bEmailValid, errorKey: sEmail && !bEmailValid ? "error.emailInvalid" : "error.emailRequired" },
                { fieldId: "passwordInput", isValid: !!sPassword, errorKey: "error.emailRequired" }
            ];
            
            if (!this.validateFields(aValidations)) {
                return;
            }

            this.setBusy(true);

            this.callAPI("/users/login", "POST", {
                email: sEmail,
                password: sPassword
            })
            .then((oResponse) => {
                this.setBusy(false);

                if (oResponse.success && oResponse.data) {
                    const oUser = oResponse.data;
                    this.setCurrentUser(oUser);
                    this.showSuccess("success.loginWelcome", [oUser.firstName]);
                    this._navigateToHomePage(oUser);
                } else {
                    this._autoCreateUser(sEmail, sPassword, oLoginModel);
                }
            })
            .catch((error) => {
                this.setBusy(false);
                
                if (error.status === 401 || error.status === 404) {
                    this._autoCreateUser(sEmail, sPassword, oLoginModel);
                } else {
                    this.showError("error.loginFailed");
                }
            });
        },

        _autoCreateUser: function (sEmail, sPassword, oLoginModel) {
            const sEmailName = sEmail.split("@")[0];
            const aNameParts = sEmailName.split(/[\s._-]+/);
            const sFirstName = aNameParts[0] ? aNameParts[0].charAt(0).toUpperCase() + aNameParts[0].slice(1) : "User";
            const sLastName = aNameParts[1] ? aNameParts[1].charAt(0).toUpperCase() + aNameParts[1].slice(1) : "User";

            this.callAPI("/users/auto-register", "POST", {
                email: sEmail,
                password: sPassword,
                firstName: sFirstName,
                lastName: sLastName,
                role: "MANAGER",
                department: "General"
            })
            .then((oResponse) => {
                if (oResponse.success && oResponse.data) {
                    const oUser = oResponse.data;
                    this.setCurrentUser(oUser);
                    this.showSuccess("success.accountCreated", [oUser.firstName]);
                    this._navigateToHomePage(oUser);
                } else {
                    this.showError("error.accountCreationFailedWithMessage", [oResponse.message || ""]);
                }
            })
            .catch(() => {
                this.showError("error.accountCreationFailed");
            });
        },

        _navigateToHomePage: function (oUser) {
            this.oRouter.navTo(oUser.role === "MANAGER" ? "managerDashboard" : "userDashboard");
        }
    });
});

