sap.ui.define([
    "sap/ui/core/format/DateFormat"
], function (DateFormat) {
    "use strict";

    function getText(sKey, aArgs) {
        try {
            var oI18n = sap.ui.getCore().getModel("i18n");
            var oBundle = oI18n && oI18n.getResourceBundle && oI18n.getResourceBundle();
            if (oBundle) {
                return aArgs ? oBundle.getText(sKey, aArgs) : oBundle.getText(sKey);
            }
        } catch (e) {}
        return aArgs && aArgs.length ? (sKey + ": " + aArgs.join(", ")) : sKey;
    }

    return {
        /**
         * Format status text for display
         * @param {string} sStatus - The status value
         * @returns {string} Formatted status text
         */
        formatStatus: function (sStatus) {
            if (!sStatus) {
                return "";
            }
            return getText("status." + sStatus, [sStatus]) || sStatus;
        },

        /**
         * Get state for ObjectStatus based on status
         * @param {string} sStatus - The status value
         * @returns {string} State value (Success, Error, Warning, None)
         */
        formatStatusState: function (sStatus) {
            if (!sStatus) {
                return "None";
            }
            
            const stateMap = {
                "APPROVED": "Success",
                "REJECTED": "Error",
                "PARTIALLY_REJECTED": "Warning",
                "PENDING_APPROVAL": "Warning",
                "CANCELLED": "None",
                "DRAFT": "Information"
            };
            
            return stateMap[sStatus] || "None";
        },

        /**
         * Format date to readable format
         * @param {Date|string} oDate - Date object or string
         * @returns {string} Formatted date
         */
        formatDate: function (oDate) {
            if (!oDate) {
                return "";
            }
            
            const date = oDate instanceof Date ? oDate : new Date(oDate);
            
            if (isNaN(date.getTime())) {
                return "";
            }
            
            const oDateFormat = DateFormat.getDateInstance({
                pattern: "dd MMM yyyy"
            });
            
            return oDateFormat.format(date);
        },

        /**
         * Format date and time to readable format
         * @param {Date|string} oDate - Date object or string
         * @returns {string} Formatted date and time
         */
        formatDateTime: function (oDate) {
            if (!oDate) {
                return "";
            }
            
            const date = oDate instanceof Date ? oDate : new Date(oDate);
            
            if (isNaN(date.getTime())) {
                return "";
            }
            
            const oDateFormat = DateFormat.getDateTimeInstance({
                pattern: "dd MMM yyyy, HH:mm"
            });
            
            return oDateFormat.format(date);
        },

        /**
         * Format user role for display
         * @param {string} sRole - The role value
         * @returns {string} Formatted role text
         */
        formatRole: function (sRole) {
            if (!sRole) {
                return "";
            }
            return getText("role." + sRole, [sRole]) || sRole;
        },

        /**
         * Format vacation type for display
         * @param {string} sType - The vacation type value
         * @returns {string} Formatted vacation type text
         */
        formatVacationType: function (sType) {
            if (!sType) {
                return "";
            }
            return getText("vacationType." + sType, [sType]) || sType;
        },

        /**
         * Format attachment status for display
         * @param {string} sStatus - The attachment status value
         * @returns {string} Formatted attachment status text
         */
        formatAttachmentStatus: function (sStatus) {
            if (!sStatus) {
                return "";
            }
            return getText("attachmentStatus." + sStatus, [sStatus]) || sStatus;
        },

        /**
         * Get state for attachment status
         * @param {string} sStatus - The attachment status value
         * @returns {string} State value
         */
        formatAttachmentStatusState: function (sStatus) {
            if (!sStatus) {
                return "None";
            }
            
            const stateMap = {
                "APPROVED": "Success",
                "REJECTED": "Error",
                "PENDING": "Warning"
            };
            
            return stateMap[sStatus] || "None";
        },

        /**
         * Check if status is partially rejected
         * @param {string} sStatus - The status value
         * @returns {boolean} True if partially rejected
         */
        isPartiallyRejected: function (sStatus) {
            return sStatus === "PARTIALLY_REJECTED";
        },

        /**
         * Check if status is rejected (fully or partially)
         * @param {string} sStatus - The status value
         * @returns {boolean} True if rejected
         */
        isRejected: function (sStatus) {
            return sStatus === "REJECTED" || sStatus === "PARTIALLY_REJECTED";
        },

        /**
         * Check if attachment is rejected
         * @param {string} sStatus - The attachment status value
         * @returns {boolean} True if rejected
         */
        isAttachmentRejected: function (sStatus) {
            return sStatus === "REJECTED";
        },

        /**
         * Format full name from first and last name
         * @param {string} sFirstName - First name
         * @param {string} sLastName - Last name
         * @returns {string} Full name
         */
        formatFullName: function (sFirstName, sLastName) {
            if (!sFirstName && !sLastName) {
                return "";
            }
            
            return [sFirstName, sLastName].filter(Boolean).join(" ");
        },

        /**
         * Get initials from name
         * @param {string} sFirstName - First name
         * @param {string} sLastName - Last name
         * @returns {string} Initials
         */
        getInitials: function (sFirstName, sLastName) {
            let initials = "";
            
            if (sFirstName) {
                initials += sFirstName.charAt(0).toUpperCase();
            }
            
            if (sLastName) {
                initials += sLastName.charAt(0).toUpperCase();
            }
            
            return initials || "?";
        },

        /**
         * Calculate duration between two dates
         * @param {Date|string} oStartDate - Start date
         * @param {Date|string} oEndDate - End date
         * @returns {string} Duration text
         */
        calculateDuration: function (oStartDate, oEndDate) {
            if (!oStartDate || !oEndDate) {
                return "";
            }
            
            const startDate = oStartDate instanceof Date ? oStartDate : new Date(oStartDate);
            const endDate = oEndDate instanceof Date ? oEndDate : new Date(oEndDate);
            
            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                return "";
            }
            
            const diffTime = Math.abs(endDate - startDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end days
            
            return diffDays === 1
                ? getText("duration.singleDay")
                : getText("duration.multipleDays", [diffDays]);
        },

        /**
         * Calculate duration in days between two dates (returns number)
         * @param {Date|string} oStartDate - Start date
         * @param {Date|string} oEndDate - End date
         * @returns {number} Number of days
         */
        calculateDurationDays: function (oStartDate, oEndDate) {
            if (!oStartDate || !oEndDate) {
                return 0;
            }
            
            const startDate = oStartDate instanceof Date ? oStartDate : new Date(oStartDate);
            const endDate = oEndDate instanceof Date ? oEndDate : new Date(oEndDate);
            
            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                return 0;
            }
            
            const diffTime = Math.abs(endDate - startDate);
            return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end days
        },

        /**
         * Check if a date is in the past
         * @param {Date|string} oDate - Date to check
         * @returns {boolean} True if in the past
         */
        isDatePast: function (oDate) {
            if (!oDate) {
                return false;
            }
            
            const date = oDate instanceof Date ? oDate : new Date(oDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            return date < today;
        },

        /**
         * Check if a date range overlaps with another
         * @param {Date|string} oStart1 - Start date of first range
         * @param {Date|string} oEnd1 - End date of first range
         * @param {Date|string} oStart2 - Start date of second range
         * @param {Date|string} oEnd2 - End date of second range
         * @returns {boolean} True if overlaps
         */
        datesOverlap: function (oStart1, oEnd1, oStart2, oEnd2) {
            const start1 = oStart1 instanceof Date ? oStart1 : new Date(oStart1);
            const end1 = oEnd1 instanceof Date ? oEnd1 : new Date(oEnd1);
            const start2 = oStart2 instanceof Date ? oStart2 : new Date(oStart2);
            const end2 = oEnd2 instanceof Date ? oEnd2 : new Date(oEnd2);
            
            return start1 <= end2 && start2 <= end1;
        },

        /**
         * Format request type icon
         * @param {string} sType - Request type
         * @returns {string} Icon name
         */
        getRequestTypeIcon: function (sType) {
            const iconMap = {
                "Travel": "sap-icon://travel-expense",
                "Equipment": "sap-icon://product",
                "Vacation": "sap-icon://general-leave-request"
            };
            
            return iconMap[sType] || "sap-icon://document";
        },

        /**
         * Format request type label via i18n
         * @param {string} sType - Request type key
         * @returns {string} Localized label
         */
        formatRequestType: function (sType) {
            if (!sType) { return ""; }
            return getText("requestType." + sType, [sType]) || sType;
        },

        /**
         * Get color for request type
         * @param {string} sType - Request type
         * @returns {string} Color value
         */
        getRequestTypeColor: function (sType) {
            const colorMap = {
                "Travel": "#007bff",
                "Equipment": "#6c757d",
                "Vacation": "#28a745"
            };
            
            return colorMap[sType] || "#6c757d";
        }
    };
});

