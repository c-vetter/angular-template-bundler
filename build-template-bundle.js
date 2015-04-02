'use strict'

var fs = require('fs')
var async = require('async')

var utf8 = { encoding: 'utf-8' }
var templates = {}

var srcDir = process.argv[2] || 'templates'
var destFile = process.argv[3] || srcDir + '.json'

console.log('source directory:  %s', srcDir)
console.log('destination file:  %s', destFile)
console.log('')

function handleError (err) {
  console.error(err)
  process.exit(1)
}

function getTemplate (route, callback) {
  fs.readFile(
    route,
    utf8,
    function putTemplate (err, data) {
      if(err) {
        callback(err)
        return
      }

      templates[route] = data
      callback()
    }
  )
}

function templatesBundleWritten (err) {
  if (err) {
    handleError(err)
    return
  }

  console.log(
    'templates bundle written to %s',
    destFile
  )
}

function writeTemplatesBundle (err) {
  if (err) {
    handleError(err)
    return
  }

  fs.writeFile(
    destFile,
    JSON.stringify(templates),
    templatesBundleWritten
  )
}

function fileVisible (filename) {
  return filename.charAt() !== '.'
}

function routeForFilename (filename) {
  return srcDir + '/' + filename
}

fs.readdir(srcDir, function (err, filenames) {
  if (err) {
    handleError(err)
    return
  }

  filenames = filenames.filter(fileVisible)

  console.log('filenames: \n', filenames)
  console.log('')

  async.each(
    filenames.map(routeForFilename),
    getTemplate,
    writeTemplatesBundle
  )
})
