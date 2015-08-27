angular.module('foodmeApp.cartHelper', [])

// Just holds some global configuration variables that we can set to whatever
// we need.
.factory('fmaCartHelper', ["fmaSharedState", "$q", "$http", function(fmaSharedState, $q, $http) {
  var getOptionsForItem = function(singleItem) {
    console.log('Getting options');
    var optionsToReturn = [];
    var requiredOptionGroups = [];
    for (var v1 = 0; v1 < singleItem.children.length; v1++) {
      // Find the option groups with min_selection > 0.
      var currentChild = singleItem.children[v1];
      if (currentChild.min_selection > 0) {
        requiredOptionGroups.push(currentChild);
      }
    }

    for (v1 = 0; v1 < requiredOptionGroups.length; v1++) {
      // We shuffle the options, then sort them by price and pick the first ones
      // until we have enough to satisfy min_selection. Works because sort is
      // stable.
      var requiredOG = requiredOptionGroups[v1];
      requiredOG.children = _.shuffle(requiredOG.children);
      requiredOG.children.sort(function(option1, option2) {
        return option1.price - option2.price;
      });
      for (v2 = 0; v2 < requiredOG.min_selection; v2++) {
        var chosenOption = requiredOG.children[v2];
        optionsToReturn.push(chosenOption);
        if (chosenOption.children.length > 0) {
          // This is weird to me but options can have their own option groups, so
          // we have to recurse on the option's children to add more possible
          // options.
          console.log("Recurring.");
          var optionsForOption = getOptionsForItem(chosenOption);          
          optionsToReturn = optionsToReturn.concat(optionsForOption);
        }
      }
    }
    return optionsToReturn;
  };

  var constructRequestFromOptions = function(optionsForItem) {
    requestObj = {};
    for (var v1 = 0; v1 < optionsForItem.length; v1++) {
      var currentOption = optionsForItem[v1];
      var amount = 1;
      if (currentOption.increment != null) {
        amount = currentOption.increment;
      }
      // Set the minimum amount necessary to make this order work.
      requestObj[currentOption.id] = amount;
    }
    return requestObj;
  };

  // Takes all of the menu items (cartItemsFound), looks at their options, and
  // constructs "proper" Item objects that we can then pass to the delivery.com
  // cart API.
  //
  // https://developers.delivery.com/customer-cart/#item-object
  var createCartRequestsFromItems = function(itemDetails) {
    // One request object for each thing in itemDetails.
    var finalItemRequestObjects = [];
    for (var v1 = 0; v1 < itemDetails.length; v1++) {
      var currentItem = itemDetails[v1].item_details;
      var optionsForItem = getOptionsForItem(currentItem);
      // Add the selected options to the currentItem for fun.
      currentItem.selectedOptions = optionsForItem;

      // Create the actual request object.
      var optionRequestObject = constructRequestFromOptions(optionsForItem);
      var itemRequestObject = {
        item_id: currentItem.id,
        item_qty: 1,
        instructions: "Nader Al-Naji is GOD!",
        option_qty: optionRequestObject,
      };
      var finalRequestObject = {
        order_type: "delivery",
        client_id: fmaSharedState.client_id,
        item: itemRequestObject,
      };
      // Add the request object to our list.
      finalItemRequestObjects.push(finalRequestObject);
    }
    return finalItemRequestObjects;
  };

  var clearCartsPromise = function(itemDetails, rawAccessToken) {
    return $q(function(resolve, reject) {
      var successfulPromisesReturned = 0;
      var failedPromisesReturned = 0;
      for (var v1 = 0; v1 < itemDetails.length; v1++) {
        $http({
          method: 'DELETE',
          url: fmaSharedState.endpoint+'/customer/cart/'+itemDetails[v1].cart_item.merchantId+'?client_id=' + fmaSharedState.client_id,
          headers: {
            "Authorization": rawAccessToken,
            "Content-Type": "application/json",
          }
        }).then(
          function(res) {
            successfulPromisesReturned++;
            if (successfulPromisesReturned +
                failedPromisesReturned === itemDetails.length) {
              resolve();
            }
          },
          function(err) {
            console.log(err);
            failedPromisesReturned++;
            if (successfulPromisesReturned +
                failedPromisesReturned === itemDetails.length) {
              resolve();
            }
          }
        );
      }
    });
  };

  var addCartsPromise = function(itemDetails, itemRequestObjects, rawAccessToken) {
    return $q(function(resolve, reject) {
      var successfulPromisesReturned = 0;
      var failedPromisesReturned = 0;
      for (var v1 = 0; v1 < itemDetails.length; v1++) {
        (function (x1) {
          // Add all items to the user's delivery.com cart.
          $http({
            method: 'POST',
            url: fmaSharedState.endpoint+'/customer/cart/'+itemDetails[x1].cart_item.merchantId+'?client_id=' + fmaSharedState.client_id,
            data: itemRequestObjects[x1],
            headers: {
              "Authorization": rawAccessToken,
              "Content-Type": "application/json",
            }
          }).then(
            function(res) {
              successfulPromisesReturned++;
              if (successfulPromisesReturned +
                  failedPromisesReturned === itemDetails.length) {
                resolve();
              }
            },
            function(err) {
              alert("Doh! One of the items in your cart couldn't actually be " +
                    "bought. This should never happen-- call me: 212-729-6389.");
              console.log("One item couldn't be added to cart.");
              console.log(err);
              failedPromisesReturned++;
              if (successfulPromisesReturned +
                  failedPromisesReturned === itemDetails.length) {
                resolve();
              }
            }
          );
        })(v1);
      }
    });
  };

  var clearCartThenUpdateCartPromise = function(itemDetails, rawAccessToken) {
    return $q(function(resolve, reject) {
      // Actual init.
      itemRequestObjects = createCartRequestsFromItems(itemDetails);
      var very_sorry =
        "One or more of the items in your cart aren't actually available " +
        "right now because it's dinner time and they're lunch-only items or " +
        "something like that. Go back to the cart page and try removing the " +
        "offending item :*( I promise this will be fixed soon!!!";
      // Clear the user's cart.
      clearCartsPromise(itemDetails, rawAccessToken)
      .then(
        // At this point the cart should be cleared.
        function(res) {
          addCartsPromise(itemDetails, itemRequestObjects, rawAccessToken)
          .then(
            function(res) {
              // Cleared the cart and refreshed it with all our new items
              // YAY!
              resolve(res);
            },
            function(err) {
              alert(very_sorry);
              reject(err);
            }
          );
        },
        function(err) {
          // We can't ever get here because clearCartsPromise always resolves.
          alert(very_sorry);
          reject(err);
        }
      );
    });
  };

  return {
    clearCartThenUpdateCartPromise: clearCartThenUpdateCartPromise,
  };
}]);