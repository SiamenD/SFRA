'use strict';
/* global XML */

var braintreeApi = {};
var prefs = require('~/cartridge/config/braintreePreferences')();

/**
 * Transform inappropriate values in request data object into empty string
 * @param {Object} source Request data
 * @return {Object | Array} Formatted request data
 */
function prepareXmlData(source) {
    var sourceData = source;
    function parse(data, keyPath) { // eslint-disable-line require-jsdoc
        var dataParsed = data;
        var notEmptyCount = 0;
        for (var key in dataParsed) {
            var val = dataParsed[key];
            if (typeof val === 'object' && val !== null && val !== undefined) {
                parse(val, keyPath + '.' + key);
                notEmptyCount++;
            } else if (val || val === false) {
                notEmptyCount++;
            } else {
                dataParsed[key] = '';
            }
        }
        if (!notEmptyCount) {
            var keys = keyPath.split('.').slice(1);
            if (keys.length === 1) {
                delete sourceData[keys[0]];
            }
            if (keys.length === 2) {
                delete sourceData[keys[0]][keys[1]];
            }
            if (keys.length === 3) {
                delete sourceData[keys[0]][keys[1]][keys[2]];
            }
        }
    }
    parse(sourceData, '');
    return sourceData;
}

/**
 * Create XML string for <merchant-account-id />
 * @param {string} currencyCode - Currency Code
 * @return {string} XML <merchant-account-id>MerchantID</merchant-account-id>
 */
function createMerchantAccountXml(currencyCode) {
    var merchantAccounts = {};
    var code = currencyCode.toUpperCase();
    for (var fieldName in prefs.BRAINTREE_Merchant_Account_IDs) {
        var fieldArr = prefs.BRAINTREE_Merchant_Account_IDs[fieldName].split(':');
        merchantAccounts[fieldArr[0].toUpperCase()] = fieldArr[1];
    }

    if (typeof merchantAccounts[code] === 'string') {
        return '<merchant-account-id>' + merchantAccounts[code].replace(/\s/g, '') + '</merchant-account-id>';
    }
    return '<merchant-account-id/>';
}

/**
 * Create XML request data, based on current API call
 * @param {string} xmlType Type of data that are needed for this API call
 * @param {Object} sourceData Request data
 * @return {string} XML for API call
 */
braintreeApi.createXml = function (xmlType, sourceData) {
    var result;
    var data = prepareXmlData(sourceData || {});
    var xmlData = require('./braintreeXmlData')(xmlType, data);

    // eslint-disable-next-line default-case
    switch (xmlType) {
        case 'empty':
            return '';

        case 'client_token':
            result = xmlData.replace('<merchant-account-id/>', braintreeApi.createMerchantAccountXml(data.currencyCode));
            return result;

        case 'customer':
            return xmlData;

        case 'billing':
            return xmlData;

        case 'billing_address':
            result = xmlData;
            if (data.updateExisting) {
                result = result.replace('<options/>', '<options><update-existing type="boolean">true</update-existing></options>');
            }
            return result;

        case 'shipping':
            result = xmlData;
            result = result.replace('<country-code-alpha/>', data.level_2_3_processing && data.countryCodeAlpha3 ? '<country-code-alpha3>' + data.countryCodeAlpha3 + '</country-code-alpha3>'
                : '<country-code-alpha2>' + data.countryCodeAlpha2 + '</country-code-alpha2>');

            return result;

        case 'transaction_amount':
            result = xmlData;
            result = result.replace('<amount/>', data.amount ? '<amount>' + data.amount + '</amount>' : '');

            return result;

        case 'descriptor':
            result = xmlData;
            result = result.replace('<name/>', data.name ? '<name>' + data.name + '</name>' : '');
            result = result.replace('<phone/>', data.name ? '<phone>' + data.phone + '</phone>' : '');
            result = result.replace('<url/>', data.name ? '<url>' + data.url + '</url>' : '');
            return result;

        case 'transaction':
            result = xmlData;
            if (data.descriptor) {
                result = result.replace('<descriptor/>', braintreeApi.createXml('descriptor', data.descriptor));
            }

            if (data.customer) {
                result = result.replace('<customer/>', braintreeApi.createXml('customer', data.customer));
            }
            if (data.billing) {
                result = result.replace('<billing/>', braintreeApi.createXml('billing', data.billing));
            }
            if (data.shipping) {
                result = result.replace('<shipping/>', braintreeApi.createXml('shipping', data.shipping));
            }
            if (data.options.addShippingAddress) {
                result = result.replace('<store-shipping-address-in-vault/>', '<store-shipping-address-in-vault type="boolean">' + data.options.addShippingAddress + '</store-shipping-address-in-vault>');
            }
            if (data.options.addBillingAddress) {
                result = result.replace('<add-billing-address-to-payment-method/>', '<add-billing-address-to-payment-method type="boolean">' + data.options.addBillingAddress + '</add-billing-address-to-payment-method>');
            }
            if (data.options.storeInVault) {
                result = result.replace('<store-in-vault/>', '<store-in-vault type="boolean">' + data.options.storeInVault + '</store-in-vault>');
            }
            if (data.options.storeInVaultOnSuccess) {
                result = result.replace('<store-in-vault-on-success/>', '<store-in-vault-on-success type="boolean">' + data.options.storeInVaultOnSuccess + '</store-in-vault-on-success>');
            }
            if (data.options.payeeEmail) {
                result = result.replace('<paypal/>', '<paypal><payee_email>' + data.options.payeeEmail + '</payee_email></paypal>');
            }
            if (data.billingAddressId) {
                result = result.replace('<billing-address-id/>', '<billing-address-id>' + data.billingAddressId + '</billing-address-id>');
            }
            if (data.shippingAddressId) {
                result = result.replace('<shipping-address-id/>', '<shipping-address-id>' + data.shippingAddressId + '</shipping-address-id>');
            }
            if (data.paymentMethodNonce) {
                result = result.replace('<payment-method-identificator/>', '<payment-method-nonce>' + data.paymentMethodNonce + '</payment-method-nonce>');
            }
            if (data.paymentMethodToken) {
                result = result.replace('<payment-method-identificator/>', '<payment-method-token>' + data.paymentMethodToken + '</payment-method-token>');
            }

            result = result.replace('<merchant-account-id/>', braintreeApi.createMerchantAccountXml(data.currencyCode));

            if (data.deviceData) {
                result = result.replace('<device-data/>', '<device-data>' + data.deviceData + '</device-data>');
            }

            result = result.replace('<three_d_secure/>', data.is3dSecuteRequired ? '<three_d_secure><required type="boolean">true</required></three_d_secure>' : '');

            if (data.customFields) {
                result = result.replace('<custom-fields/>', '<custom-fields>' + data.customFields + '</custom-fields>');
            }
            if (data.level_2_3_processing) {
                /** Level 2 fields */
                // result = result.replace('<purchase-order-number/>', '<purchase-order-number>' + data.orderId + '</purchase-order-number>');
                result = result.replace('<tax-amount/>', '<tax-amount>' + data.taxAmount + '</tax-amount>');

                /**
                 * Due to Rounding discount issues, removed from BRAINTREE_PAYPAL scope due to bug on PayPal end.
                 * No ETA on bug fix and not in roadmap.
                 */
                if (!data.l2_only) {
                    /** Level 3 fields */
                    result = result.replace('<shipping-amount/>', '<shipping-amount>' + data.shippingAmount + '</shipping-amount>');
                    result = result.replace('<discount-amount/>', '<discount-amount>' + data.discountAmount + '</discount-amount>');
                    // result = result.replace('<ships-from-postal-code/>', '<ships-from-postal-code>' + data.shipsFromPostalCode + '</ships-from-postal-code>');
                    result = result.replace('<line-items/>', braintreeApi.createXml('line-items', data.lineItems));
                }
            }
            return result;

        case 'transaction_clone':
            return xmlData;

        case 'transactions_search':
            return xmlData;

        case 'search_transactions_by_ids':
            var idsStr = '';
            data.ids.forEach(function (id) {
                idsStr += '<item>' + id + '</item>';
            });
            return '<search><ids type="array">' + idsStr + '</ids></search>';

        case 'payment_method':
            data.makeDefault = data.makeDefault || '';
            data.failOnDuplicatePaymentMethod = data.failOnDuplicatePaymentMethod || '';
            data.verifyCard = data.verifyCard || '';
            result = xmlData;
            if (data.billingAddress) {
                result = result.replace('<billing-address/>', braintreeApi.createXml('billing_address', data.billingAddress));
            }
            result = result.replace('<customer-id/>', data.customerId ? '<customer-id>' + data.customerId + '</customer-id>' : '');
            result = result.replace('<payment-method-nonce/>', data.paymentMethodNonce ? '<payment-method-nonce>' + data.paymentMethodNonce + '</payment-method-nonce>' : '');
            result = result.replace('<billing-address-id/>', data.billingAddressId ? '<billing-address-id>' + data.billingAddressId + '</billing-address-id>' : '');
            return result;

        case 'credit_card':
            data.makeDefault = data.makeDefault || false;
            result = xmlData;
            if (data.billingAddress) {
                result = result.replace('<billing-address/>', braintreeApi.createXml('billing_address', data.billingAddress));
            }
            return result;

        case 'customer_create':
            data.makeDefault = data.makeDefault || false;
            result = xmlData;
            if (data.paymentMethodNonce) {
                result = result.replace('<credit-card/>', '<payment-method-nonce>' + data.paymentMethodNonce + '</payment-method-nonce>');
            } else if (data.creditCard) {
                result = result.replace('<credit-card/>', braintreeApi.createXml('credit_card', data.creditCard));
            }
            if (data.paypalPayeeEmail) {
                result = result.replace('<paypal-payee-email/>', '<paypal><payeeEmail>' + data.paypalPayeeEmail + '</payeeEmail></paypal>');
            } else {
                result = result.replace('<paypal-payee-email/>', '');
            }
            return result;

        case 'transactuion_create_vault':
            result = xmlData;
            if (data.orderId) {
                result = result.replace('<order-id/>', '<order-id>' + data.orderId + '</order-id>');
            }
            if (data.tax) {
                result = result.replace('<tax-amount/>', '<tax-amount>' + data.tax + '</tax-amount>');
            }
            if (data.customFields) {
                result = result.replace('<custom-fields/>', '<custom-fields>' + data.customFields + '</custom-fields>');
            }
            result = result.replace('<merchant-account-id/>', braintreeApi.createMerchantAccountXml(data.currencyCode));
            return result;
        case 'transaction_create':
            result = xmlData;
            if (data.customFields) {
                result = result.replace('<custom-fields/>', '<custom-fields>' + data.customFields + '</custom-fields>');
            }
            result = result.replace('<merchant-account-id/>', braintreeApi.createMerchantAccountXml(data.currencyCode));
            return result;

        case 'customer_update':
            return xmlData;

        case 'address_create':
            return xmlData;

        case 'line-items':
            var lineItem = '';
            data.forEach(function (value) {
                lineItem += '<line-item>';
                lineItem += '<name>' + value.name + '</name>';
                lineItem += '<kind>' + value.kind + '</kind>';
                lineItem += '<quantity>' + value.quantity + '</quantity>';
                lineItem += '<unit-amount>' + value.unitAmount + '</unit-amount>';
                lineItem += '<unit-of-measure>' + value.unitOfMeasure + '</unit-of-measure>';
                lineItem += '<total-amount>' + value.totalAmount + '</total-amount>';
                lineItem += '<tax-amount>' + value.taxAmount + '</tax-amount>';
                lineItem += '<discount-amount>' + value.discountAmount + '</discount-amount>';
                lineItem += '<product-code>' + value.productCode + '</product-code>';
                lineItem += '<commodity-code>' + value.commodityCode + '</commodity-code>';
                lineItem += '</line-item>';
            });
            return '<line-items type="array">' + lineItem + '</line-items>';
    }
    return '';
};

/**
 * Parse XML into Object
 * @param {string} xmlStr XML string
 * @return {Object} Parsed object
 */
braintreeApi.parseXml = function (xmlStr) {
    var resultObj = {};
    var xmlObj = new XML(xmlStr);

    function formatNodeName(name) { // eslint-disable-line require-jsdoc
        var nameParts = name.split('-');
        for (var i = 1; i < nameParts.length; i++) {
            nameParts[i] = nameParts[i].charAt(0).toUpperCase() + nameParts[i].slice(1);
        }
        return nameParts.join('');
    }

    function parse(node, objectToParse) { // eslint-disable-line require-jsdoc
        var obj = objectToParse;
        var nodeName = formatNodeName(node.name().toString());
        var elements = node.elements();
        var element = null;
        var elementIndx = null;

        if (elements.length()) {
            var nodeType = node.attribute('type').toString();
            if (nodeType === 'array' || nodeType === 'collection') {
                obj[nodeName] = [];
                if (elements[0] && elements[0].hasSimpleContent() && nodeType !== 'collection') {
                    for (elementIndx in elements) {
                        element = elements[elementIndx];
                        obj[nodeName].push(element.text().toString());
                    }
                } else {
                    for (elementIndx in elements) {
                        element = elements[elementIndx];
                        parse(element, obj[nodeName]);
                    }
                }
            } else if (obj instanceof Array) {
                var objNew = {};
                obj.push(objNew);
                for (elementIndx in elements) {
                    element = elements[elementIndx];
                    parse(element, objNew);
                }
            } else {
                obj[nodeName] = {};
                for (elementIndx in elements) {
                    element = elements[elementIndx];
                    parse(element, obj[nodeName]);
                }
            }
        } else {
            obj[nodeName] = node.text().toString();
        }
    }

    parse(xmlObj, resultObj);
    return resultObj;
};

braintreeApi.createMerchantAccountXml = createMerchantAccountXml;
braintreeApi.prepareXmlData = prepareXmlData;
module.exports = braintreeApi;
