/* eslint-disable no-inner-declarations */
'use strict';

/* global braintreeUtils braintree paypal $ */

braintreeUtils.payPal = (function () {
    var bu = braintreeUtils;
    var console = bu.console;

    var pid;
    var uuid;
    var removeFromCartUrl;
    var appendToUrl;
    var $braintreePDPButton = $('.braintree_pdp_button');
    var $miniCartQuantity = parseInt($('.minicart-quantity').text(), 0);
    var $addToCartButton = $('.add-to-cart') || $('.add-to-cart-global');

    function Constructor(initParams, $btn) {
        var params = initParams;
        this.params = initParams;
        params.options = params.options || {};

        this.$btn = $btn;
        var $errorContainer = $('<div class="error"></div>');

        if (params.$errorContainer) {
            $errorContainer = params.$errorContainer;
            delete params.$errorContainer;
        }

        var $loaderContainter = $('<div class="braintree-loader"></div>');

        if (params.$loaderContainer) {
            $loaderContainter = params.$loaderContainer;
        }

        $btn.after($errorContainer);
        $btn.after($loaderContainter);

        this.er = bu.createErrorInstance($errorContainer[0]);
        this.loader = bu.createLoaderInstance($loaderContainter[0]);
        var that = this;

        if (params.isFraudToolsEnabled) {
            that.loader.show();
            braintree.dataCollector.create({
                authorization: bu.clientToken,
                paypal: true,
                kount: false
            }, function (error, data) {
                that.loader.hide();
                if (error) {
                    console.log(error);
                    return;
                }
                $('input[name=braintreePaypalRiskData]').val(data.deviceData);
                params.riskData = data.deviceData;
            });
        }

        // Check minicart quantity and hide PDPbutton if it is not empty
        if ($miniCartQuantity > 0) {
            $braintreePDPButton.hide();
        }

        that.loader.show();

        braintree.client.create({
            authorization: bu.clientToken
        }, function (error, clientInstance) {
            if (error) {
                that.er.show(error);
                return;
            }

            braintree.paypalCheckout.create({
                authorization: bu.clientToken
            }, function (err, paypalCheckoutInstance) {
                if (err) {
                    that.er.show(err);
                    return;
                }
                if ($braintreePDPButton.length) {
                    if ($addToCartButton.prop('disabled')) {
                        $braintreePDPButton.hide();
                    }
                    $('body').on('cart:update', function () {
                        $miniCartQuantity = parseInt($('.minicart-quantity').text(), 0);
                        if ($addToCartButton.prop('disabled')) {
                            $braintreePDPButton.hide();
                        }
                        if ($miniCartQuantity === 0 && !$addToCartButton.prop('disabled')) {
                            $braintreePDPButton.show();
                        }
                    });

                    $('body').on('product:afterAddToCart', function () {
                        $braintreePDPButton.hide();
                    });

                    // Check if options was selected, if no we hide paypalButton
                    $(document).on('change', 'select[class*="select-"], .options-select', function () {
                        $miniCartQuantity = parseInt($('.minicart-quantity').text(), 0);
                        var url = $(this).find(':selected').val();
                        var size = url.slice(url.search('size=') + 5, url.indexOf('&', url.search('size=')));

                        if ($miniCartQuantity === 0) {
                            if ($addToCartButton.prop('disabled')) {
                                $braintreePDPButton.show();
                            }
                            if (!$addToCartButton.prop('disabled') && !size) {
                                $braintreePDPButton.hide();
                            }
                        }
                    });
                }
                appendToUrl = function (url, param) {
                    var newUrl = url;
                    newUrl += (newUrl.indexOf('?') !== -1 ? '&' : '?') + Object.keys(param).map(function (key) {
                        return key + '=' + encodeURIComponent(param[key]);
                    }).join('&');

                    return newUrl;
                };

                var paypalButtonConfig = {
                    env: clientInstance.getConfiguration().gatewayConfiguration.environment === 'production' ? 'production' : 'sandbox',
                    payment: function () {
                        // https://braintree.github.io/braintree-web/current/PayPalCheckout.html#createPayment
                        if ($braintreePDPButton.length && $braintreePDPButton.is(':visible')) {
                            that.er.hide();
                            paypal.Button.props.payment.timeout = 30000;
                            var res = braintreeUtils.pdpOnlickForAsignedPaypalPayment(paypalCheckoutInstance);
                            if (res.cart) {
                                uuid = res.pliUUID;
                                removeFromCartUrl = res.cart.actionUrls.removeProductLineItemUrl;
                                pid = res.pid;
                                that.params.options.amount = parseFloat(res.cart.totals.grandTotal.replace(/\$|,/g, ''));
                            } else {
                                throw new Error(res.message || 'Error occurs');
                            }
                        }
                        return paypalCheckoutInstance.createPayment(that.params.options);
                    },
                    locale: params.options.locale,
                    commit: false,
                    style: {
                        layout: 'vertical',  // horizontal | vertical
                        size: 'responsive',    // medium | large | responsive
                        shape: 'pill',      // pill | rect
                        color: 'gold'       // gold | blue | silver | black
                        // label: 'checkout',
                        // checkout The PayPal Checkout button. The default button.
                        // credit   The PayPal Credit button. Initializes the credit flow. Cannot be used with any custom color option.
                        // pay      The Pay With PayPal button. Initializes the checkout flow.
                        // buynow   The Buy Now button. Initializes the checkout flow. The default Buy Now button is unbranded. To include PayPal branding, set branding: true.
                        // paypal   The generic PayPal button. Initializes the checkout flow. This button contains only the PayPal brand logo.
                        // tagline: true, // false - to disable the tagline/text beneath the button
                        // maxbuttons: 4, //1-4
                        // fundingicons: true, // true  Displays funding instrument icons. Not valid for the credit button.
                        // false Hides funding instrument icons.
                    },
                    funding: {
                        allowed: [paypal.FUNDING.CARD, paypal.FUNDING.CREDIT, paypal.FUNDING.VENMO],
                        disallowed: []
                        // paypal.FUNDING.CREDIT    Allow buyers to pay with PayPal Credit.                 Enabled by default for US buyers.
                        // paypal.FUNDING.CARD      Allow buyers to pay with their credit or debit card     Enabled by default for all buyers.
                        // paypal.FUNDING.ELV       Allow German buyers to pay with their bank account      Enabled by default for DE buyers.
                    },
                    onAuthorize: function (data, actions) {
                        return new paypal.Promise(function (resolve, reject) {
                            paypalCheckoutInstance.tokenizePayment(data).then(function (payload) {
                                params.onTokenizePayment(payload, resolve, reject, actions, that);
                            }).catch(function (err) {
                                that.loader.hide();
                                if (err) {
                                    that.er.show(err);
                                    return;
                                }
                            });
                        });
                    },
                    onCancel: function (a, b) {
                        if (typeof params.options.onCancel === 'function') {
                            params.options.onCancel(a, b);
                        }
                        if ($braintreePDPButton.length && $braintreePDPButton.is(':visible')) {
                            var urlParams = {
                                pid: pid,
                                uuid: uuid
                            };

                            $.ajax({
                                url: appendToUrl(removeFromCartUrl, urlParams),
                                type: 'get',
                                dataType: 'json',
                                success: function () {
                                    $.spinner().stop();
                                },
                                error: function () {
                                    $.spinner().stop();
                                }
                            });
                        }
                    },
                    onError: function (err) {
                        that.er.show(err.message.split(/\r?\n/g)[0]);

                        if ($braintreePDPButton.length && $braintreePDPButton.is(':visible') && pid) {
                            var productID = pid;
                            var urlParams = {
                                pid: productID,
                                uuid: uuid
                            };

                            $.ajax({
                                url: appendToUrl(removeFromCartUrl, urlParams),
                                type: 'get',
                                dataType: 'json',
                                success: function () {
                                    $.spinner().stop();
                                },
                                error: function () {
                                    $.spinner().stop();
                                }
                            });
                        }
                    }
                };

                paypalButtonConfig = $.extend(false, paypalButtonConfig, that.params.paypalConfig);

                if (that.params.paypalConfig.bmConfigurationInvalid) {
                    console.error('Invalid configuration in BM: Merchant Tools > Site Preferences > Custom Preference > BRAINTREE_PAYPAL > Field: ' + that.params.paypalConfig.bmConfigurationInvalid);
                    return;
                }
                paypal.Button.render(paypalButtonConfig, that.$btn[0]).then(function () {
                    that.loader.hide();
                });
            });
        });
    }

    Constructor.prototype.updateAmount = function (amount) {
        this.params.options.amount = amount;
    };

    Constructor.prototype.updateShippingAddress = function (data) {
        this.params.options.shippingAddressOverride = data;
    };

    function initAccountListAndSaveFunctionality() {
        var $accountsList = $('#braintreePaypalAccountsList');
        var $savePaypalAccountCountainerEl = $('#braintreeSavePaypalAccountContainer');
        var $savePaypalAccountEl = $('#braintreeSavePaypalAccount');
        var $paypalAccounMakeDefaultEl = $('#braintreePaypalAccountMakeDefault');

        function accountsListChange() { // eslint-disable-line require-jsdoc
            if ($accountsList.val() === 'newaccount') {
                if ($savePaypalAccountCountainerEl.length) {
                    $savePaypalAccountCountainerEl.show();
                    $savePaypalAccountEl[0].checked = true;
                    $savePaypalAccountEl[0].disabled = false;
                }
                if ($paypalAccounMakeDefaultEl.length) {
                    $paypalAccounMakeDefaultEl[0].disabled = false;
                }
            } else {
                var selectedAccount = window.braintreeUtils.getSelectedData($accountsList[0]);
                if (selectedAccount && $paypalAccounMakeDefaultEl.length) {
                    if (selectedAccount['data-default'].value === 'true') {
                        $paypalAccounMakeDefaultEl[0].disabled = true;
                    } else {
                        $paypalAccounMakeDefaultEl[0].disabled = false;
                    }
                    $paypalAccounMakeDefaultEl[0].checked = true;
                }
                if ($savePaypalAccountCountainerEl.length) {
                    $savePaypalAccountEl[0].checked = false;
                    $savePaypalAccountCountainerEl.hide();
                }
            }
        }

        $savePaypalAccountEl.change(function () {
            if ($savePaypalAccountEl[0].checked) {
                $paypalAccounMakeDefaultEl[0].disabled = false;
                $paypalAccounMakeDefaultEl[0].checked = true;
            } else {
                $paypalAccounMakeDefaultEl[0].disabled = true;
                $paypalAccounMakeDefaultEl[0].checked = false;
            }
        });

        if ($accountsList.length) {
            $accountsList.change(accountsListChange);
            accountsListChange();
        }
    }

    function createBillingAddressData(inpBillingAddress, details) {
        var billingAddress = inpBillingAddress;
        billingAddress.firstName = details.firstName;
        billingAddress.lastName = details.lastName;
        billingAddress.email = details.email;
        billingAddress.phone = details.phone;
        billingAddress.countryCodeAlpha2 = billingAddress.countryCode;
        billingAddress.streetAddress = billingAddress.line1;
        billingAddress.extendedAddress = billingAddress.line2;
        billingAddress.locality = billingAddress.city;
        billingAddress.region = billingAddress.state;
        return JSON.stringify(billingAddress);
    }

    function createShippingAddressData(inpShippingAddress, details) {
        var shippingAddress = inpShippingAddress;
        if (!shippingAddress.recipientName) {
            shippingAddress.firstName = details.firstName;
            shippingAddress.lastName = details.lastName;
            shippingAddress.recipientName = details.firstName + ' ' + details.lastName;
        }
        shippingAddress.email = details.email;
        shippingAddress.phone = details.phone;
        shippingAddress.countryCodeAlpha2 = shippingAddress.countryCode;
        shippingAddress.streetAddress = shippingAddress.line1;
        shippingAddress.extendedAddress = shippingAddress.line2;
        shippingAddress.locality = shippingAddress.city;
        shippingAddress.region = shippingAddress.state;
        shippingAddress.postalCode = shippingAddress.postalCode;
        return JSON.stringify(shippingAddress);
    }

    return {
        init: function (params, $btn) {
            bu.clientToken = params.clientToken;
            $.extend(bu.messages, params.messages);
            return new Constructor(params, $btn);
        },
        initAccountListAndSaveFunctionality: initAccountListAndSaveFunctionality,
        createBillingAddressData: createBillingAddressData,
        createShippingAddressData: createShippingAddressData
    };
}());
