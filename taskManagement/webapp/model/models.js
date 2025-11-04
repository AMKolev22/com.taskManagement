sap.ui.define([
    "sap/ui/model/json/JSONModel",
    "sap/ui/Device"
], function (JSONModel, Device) {
    "use strict";

    return {
        createDeviceModel: function () {
            const oModel = new JSONModel(Device);
            oModel.setDefaultBindingMode("OneWay");
            return oModel;
        },

        createDetailModel: function () {
            return new JSONModel({
                requestId: "",
                taskId: "",
                type: "",
                status: "",
                submittedDate: "",
                manager: "",
                from: "",
                items: [],
                files: {},
                attachments: [],
                comments: [],
                totalCost: "",
                isManager: false,
                canApprove: false
            });
        },

        createPageModel: function (bNavBackVisible) {
            return new JSONModel({
                navBackVisible: bNavBackVisible !== undefined ? bNavBackVisible : true
            });
        },

        createDashboardModel: function () {
            return new JSONModel({
                tasks: []
            });
        },

        createUserDashboardModel: function () {
            return new JSONModel({
                recentTasks: [],
                activities: []
            });
        },

        createTasksModel: function () {
            return new JSONModel({
                tasks: []
            });
        },

        createEquipmentRequestModel: function () {
            return new JSONModel({
                selectedItems: [],
                totalCost: 0,
                selectedManager: "",
                filterType: "",
                searchQuery: "",
                sortBy: "",
                sortOrder: "asc",
                selectedCatalogIds: [],
                managers: [],
                showValidationMessage: false,
                validationMessage: "",
                catalogItems: [
                    { id: "1", type: "Headphones", name: "Sony WH-1000XM5", cost: 399, amount: 1, reason: "" },
                    { id: "2", type: "Headphones", name: "Bose QuietComfort 45", cost: 329, amount: 1, reason: "" },
                    { id: "3", type: "Headphones", name: "Apple AirPods Pro", cost: 249, amount: 1, reason: "" },
                    { id: "4", type: "Headphones", name: "Jabra Elite 85h", cost: 299, amount: 1, reason: "" },
                    { id: "5", type: "Laptops", name: "Dell XPS 15", cost: 1899, amount: 1, reason: "" },
                    { id: "6", type: "Laptops", name: "MacBook Pro 14\"", cost: 2499, amount: 1, reason: "" },
                    { id: "7", type: "Laptops", name: "Lenovo ThinkPad X1 Carbon", cost: 1699, amount: 1, reason: "" },
                    { id: "8", type: "Laptops", name: "HP Spectre x360", cost: 1599, amount: 1, reason: "" },
                    { id: "9", type: "Laptops", name: "ASUS ZenBook Pro", cost: 1299, amount: 1, reason: "" },
                    { id: "10", type: "Keyboards", name: "Logitech MX Keys", cost: 119, amount: 1, reason: "" },
                    { id: "11", type: "Keyboards", name: "Keychron K8 Pro", cost: 109, amount: 1, reason: "" },
                    { id: "12", type: "Keyboards", name: "Corsair K95 RGB", cost: 199, amount: 1, reason: "" },
                    { id: "13", type: "Keyboards", name: "Das Keyboard 4 Professional", cost: 169, amount: 1, reason: "" },
                    { id: "14", type: "Keyboards", name: "Microsoft Ergonomic Keyboard", cost: 69, amount: 1, reason: "" },
                    { id: "15", type: "Headphones", name: "SteelSeries Arctis Nova Pro", cost: 349, amount: 1, reason: "" },
                    { id: "16", type: "Laptops", name: "Microsoft Surface Laptop 5", cost: 1299, amount: 1, reason: "" },
                    { id: "17", type: "Keyboards", name: "Razer BlackWidow V3", cost: 139, amount: 1, reason: "" }
                ],
                filteredCatalogItems: []
            });
        },

        createTravelRequestModel: function () {
            return new JSONModel({
                destination: "",
                startDate: null,
                endDate: null,
                reason: "",
                selectedManager: null,
                foodCosts: [],
                travelCosts: [],
                showValidationMessage: false,
                validationMessage: "",
                stayCosts: [],
                managers: [],
                isResubmission: false,
                originalRequestId: null,
                rejectedAttachments: []
            });
        },

        createVacationRequestModel: function () {
            return new JSONModel({
                vacationType: "ANNUAL_LEAVE",
                startDate: null,
                endDate: null,
                duration: "",
                managerId: "",
                substituteId: "",
                reason: "",
                paid: true,
                attachments: [],
                managers: [],
                substitutes: [],
                minDate: new Date(), // Default to today for planned leave
                managerNotAvailable: false,
                substituteNotAvailable: false,
                canAddAttachment: false,
                showValidationMessage: false,
                validationMessage: "",
                validation: {
                    vacationTypeState: "None",
                    vacationTypeMessage: "",
                    startDateState: "None",
                    startDateMessage: "",
                    endDateState: "None",
                    endDateMessage: "",
                    managerState: "None",
                    managerMessage: "",
                    substituteState: "None",
                    substituteMessage: "",
                    reasonState: "None",
                    reasonMessage: ""
                }
            });
        },

        createCalendarModel: function (sTitle, sUserId, aAvailabilities) {
            return new JSONModel({
                title: sTitle || "",
                userId: sUserId || "",
                availabilities: aAvailabilities || []
            });
        },

        createLoginModel: function () {
            return new JSONModel({
                email: "",
                password: ""
            });
        },

        createMainViewModel: function () {
            return new JSONModel({
                showDetail: false,
                selectedRequest: null
            });
        },

        createFilterModel: function () {
            return new JSONModel({
                titleQuery: "",
                employeeQuery: "",
                typeFilter: "all"
            });
        },

        createManagerDashboardFilterModel: function () {
            return new JSONModel({
                searchQuery: "",
                typeFilter: "all",
                statusFilter: "all"
            });
        },

        createUserDashboardFilterModel: function () {
            return new JSONModel({
                searchQuery: "",
                typeFilter: "all"
            });
        },

        createMyTasksFilterModel: function () {
            return new JSONModel({
                searchQuery: "",
                statusFilter: "all"
            });
        },

        createTaskDetailsFilterModel: function () {
            return new JSONModel({
                descriptionQuery: "",
                categoryFilter: "",
                statusFilter: ""
            });
        }
    };
});