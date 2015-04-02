'use strict'

/**
 * @ngdoc overview
 * @name templateBundler
 * @description
 *
 * This package includes both a frontend component and a backend component:
 * * template-bundler.js -- the script file you need to include in your page
 * * build-template-bundle.js -- the build script that creates the necessary json file from your templates directory
 */

/**
 * @ngdoc module
 * @name templateBundler
 * @module templateBundler
 * @description
 *
 * Using templateBundler, your templates will be fetched all at once to cut down on HTTP requests.
 * Except during angular's bootstrapping, when requests work normally.
 * When the initial view has been rendered, all subsequent template requests will be answered with promises
 * until the bundle has been loaded, at which point all those promises will be resolved and everything
 * works as normal again.
 *
 * This works on the `$templateRequest` service. So if you use a custom template strategy that eshews that service,
 * this will not work as a drop-in solution.
 *
 * With this in place, there are three phases to template requests:
 * 1. The initial request for the first view – this should be as fast, and therefore as small, as possible
 * 2. Template loading in aggregate – all templates are now being downloaded in one single request
 * 3. All templates reside in $templateCache and are conveniently served from there through the default pathway
 *
 * Using it is as simple as it gets:
 * 1. require `templateBundler` as a dependency for your app
 * 2. make your templates available as a json file (the build script helps you with that)
 * 3. you're ready to go!
 */

var templateBundler = angular.module('templateBundler', [])
var config = { bundleURL: 'templates.json' }

/**
 * @ngdoc provider
 * @name templateBundlerConfigProvider
 * @module templateBundler
 * @description
 *
 * The `templateBundlerConfigProvider` makes configurable the request URL for the bundled templates.
 *
 * Use it like so:
 *
 var myApp = angular.module('myApp', ['templateBundler'])

 myApp.config(['templateBundlerConfigProvider', function (templateBundlerConfigProvider) {
   templateBundlerConfigProvider.setBundleURL('partials.json')
 }])
 */
templateBundler.provider('templateBundlerConfig', function () {
  this.setBundleURL = function setTemplateBundleURL (url) {
    config.bundleURL = url
  }

  this.$get = function () {
    return config
  }
})

/**
 * This is where the magic happens.
 * This injects into the $templateRequest provider to fetch all but the initial templates in aggregate.
 */
templateBundler.config(['$provide',
  function ($provide) {
    $provide.decorator(
      '$templateRequest',
      ['$delegate', '$http', '$log', '$q', '$cacheFactory', '$templateCache',
      function ($delegate, $http, $log, $q, $cacheFactory, $templateCache) {
        $log.debug('build templateBundler')

        var phase = 0
        var phaseHandlers = []
        var deferredCache = $cacheFactory('template_deferreds')


        /**
         * Emulates a normal ongoing template request by putting a promise in the $templateCache
         */
        function promiseTemplate (tpl) {
          if (!$templateCache.get(tpl)) {
            // deferred for resolution
            var deferred = $q.defer()
            // promise for $http and ngRoute
            var promise = deferred.promise

            $log.debug('promising %s', tpl)

            deferredCache.put(tpl, deferred)
            $templateCache.put(tpl, promise)
          }
        }

        /**
         * Resolves the promise for the given template.
         *
         * Returns true if there was a promise to resolve, false otherwise.
         */
        function resolvePromise (tpl, result) {
          var deferred = deferredCache.get(tpl)

          if(deferred) {
            $log.debug('resolving %s', tpl)
            deferred.resolve(result)
            return true
          } else {
            $log.debug('no promises for %s', tpl)
            return false
          }
        }

        /**
         * The initial request should be sent normally in order to have the first impression
         * render without having to wait for the other templates. The aggregation step is put
         * on hold until the initial template has been received in order to:
         * 1. make sure the initial impression is not hampered unduly by the loading of the template aggregate
         * 2. allow loading multiple template for the initial impression, if necessary (non-essential)
         */
        function initialTemplateRequest (tpl, ignoreRequestError) {
          return $delegate(tpl, ignoreRequestError).finally(aggregateTemplateRequest)
        }

        /**
         * This is the heart of the templateBundler – it requests the file containing all templates
         * and, upon receiving that, makes available each of them via the $templateCache.
         */
        function aggregateTemplateRequest () {
          $log.debug('start aggregate loading phase')

          phase = 1

          $http.get(config.bundleURL)
          .then(function(response) {
            var baseResult = angular.copy(response)
            delete baseResult.data

            angular.forEach(response.data, function (value, key) {
              if(!resolvePromise(key, angular.extend({data: value}, baseResult))) {
                // $templateRequest takes care of this for promised templates
                $templateCache.put(key, value)
              }
            })

            phase = 2

            $log.debug('aggregate loading phase complete')
          })
        }

        /**
         * This promises any template that is requested after the first
         * before the template aggregate has been received. This ensures that
         * there are no unnecessary template requests going out.
         */
        function waitingTemplateRequest (tpl, ignoreRequestError) {
          promiseTemplate(tpl)
          return $delegate(tpl, ignoreRequestError)
        }

        /**
         * This is the public interface of the templateBundler.
         * It delegates to the relevant function for the current phase.
         */
        function requestTemplate (tpl, ignoreRequestError) {
          return phaseHandlers[phase](tpl, ignoreRequestError)
        }

        // populate the phaseHandlers array
        phaseHandlers = [
          initialTemplateRequest,
          waitingTemplateRequest,
          $delegate
        ]

        return requestTemplate
      }
    ])
  }
])
