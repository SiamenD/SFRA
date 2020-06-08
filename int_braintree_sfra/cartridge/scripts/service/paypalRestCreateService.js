'use strict';

var Transaction = require('dw/system/Transaction');

var getPreference = require('*/cartridge/config/braintreePreferences.js');

/**
 * Defines callbacks for use with the LocalServiceRegistry.
 *
 * @param {Object} prefs - BraintreeHelper custom preferences
 * @returns {Object} Request object to give to the execute method.
 */
var getServiceConfig = function (prefs) {
    return {
        /**
         * @param {dw.svc.HTTPService} service - Service, which will be used for the call
         * @param {string} methodType - Method type (DELETE, GET, PATCH, POST, PUT, REDIRECT)
         * @param {string} path - Resource/Endpoint
         * @param {Object} data - Request data
         * @param {string} contentType - Content type
         * @param {Object} paypalApi - API calls helper
         * @param {boolean} isUpadateBearToken - Is need Bear Token updating
         * @returns {string} String for request
         */
        createRequest: function (service, methodType, path, data, contentType, paypalApi, isUpadateBearToken) {
            var credential = service.getConfiguration().getCredential();
            // eslint-disable-next-line no-undef
            if (!(credential instanceof dw.svc.ServiceCredential)) {
                throw new Error('Credential for int_paypal.http.rest.payment.PayPal is not set. Create and set cridential BM > Administration > Operations > Services');
            }

            var url = credential.getURL();
            var currentDate = Date.now();
            if (!url.match(/.+\/$/)) {
                url += '/';
            }

            url += prefs.paypalRestApiVersion + '/' + path;
            service.setURL(url);

            if (contentType === 'undefined') { // It's strange behaviour of DW and createRequest
                contentType = null; // eslint-disable-line no-param-reassign
            }
            contentType = contentType || 'application/json'; // eslint-disable-line no-param-reassign

            service.setRequestMethod(methodType);
            service.addHeader('Content-Type', contentType);

            var token = credential.custom.BRAINTREE_PAYPAL_RESTAPI_TempToken;
            var tokenExpiredTime = credential.custom.BRAINTREE_PAYPAL_RESTAPI_TempTokenExpiredTime;
            if (path !== 'oauth2/token') {
                if (isUpadateBearToken || !token || tokenExpiredTime < (currentDate + 10000)) {
                    var tokenResponseData = paypalApi.oauth2.getToken();
                    var tokenExirationDate = currentDate + (parseInt(tokenResponseData.expires_in, 10) * 1000);
                    Transaction.wrap(function () {
                        credential.custom.BRAINTREE_PAYPAL_RESTAPI_TempToken = tokenResponseData.access_token;
                        credential.custom.BRAINTREE_PAYPAL_RESTAPI_TempTokenExpiredTime = tokenExirationDate;
                    });
                    token = credential.custom.BRAINTREE_PAYPAL_RESTAPI_TempToken;
                }
                service.addHeader('Authorization', 'Bearer ' + token);
            }

            if (contentType === 'application/x-www-form-urlencoded') {
                Object.keys(data).forEach(function (fieldName) {
                    service.addParam(fieldName, data[fieldName]);
                });
            }
            if (contentType === 'application/json') {
                return JSON.stringify(data);
            }
            return '';
        },

        parseResponse: function (service, httpClient) {
            return JSON.parse(httpClient.getText());
        },

        getRequestLogMessage: function (request) {
            return request;
        },

        getResponseLogMessage: function (response) {
            return response.text;
        }
    };
};

module.exports = function () {
    return require('dw/svc').LocalServiceRegistry.createService('int_paypal.http.rest.payment.PayPal', getServiceConfig(getPreference()));
};
