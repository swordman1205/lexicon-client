import BaseLexiconAdapter from '../base_adapter.js'
import papaparse from 'papaparse'
import { Definition, ResourceProvider, LanguageModelFactory } from 'alpheios-data-models'
import DefaultConfig from './config.json'

class AlpheiosLexAdapter extends BaseLexiconAdapter {
  /**
   * A Client Adapter for the Alpheios V1 Lexicon service
   * @constructor
   * @param {string} lexid - the idenitifer code for the lexicon this instance
   *                         provides access to
   * @param {Object} config - JSON configuration object override
   */
  constructor (lexid = null, config = null) {
    super()
    this.lexid = lexid
    this.data = null
    this.index = null
    // this is a bit of a hack to enable inclusion of a JSON config file
    // in a way that works both pre and post-rollup. Our rollup config
    // will stringify the file and then we can parse it but if we want to
    // run unit tests on pre-rolled up code, then we need to have a fallback
    // which works with the raw ES6 import
    if (config == null) {
      try {
        let fullconfig = JSON.parse(DefaultConfig)
        this.config = fullconfig[lexid]
      } catch (e) {
        this.config = DefaultConfig[lexid]
      }
    } else {
      this.config = config
    }
    this.provider = new ResourceProvider(this.lexid, this.config.rights)
  }

  /**
   * @override BaseLexiconAdapter#lookupFullDef
   */
  async lookupFullDef (lemma = null) {
    // TODO figure out the best way to handle initial reading of the data file
    if (this.index === null && this.getConfig('urls').index) {
      let url = this.getConfig('urls').index
      let unparsed = await this._loadData(url)
      let parsed = papaparse.parse(unparsed, {})
      this.index = new Map(parsed.data)
    }
    let id
    if (this.index) {
      let model = LanguageModelFactory.getLanguageForCode(lemma.language)
      id = this._lookupInDataIndex(this.index, lemma, model)
    }
    let url = this.getConfig('urls').full
    if (id) {
      url = `${url}&n=${id}`
    } else {
      url = `${url}&l=${lemma.word}`
    }
    let targetLanguage = this.getConfig('langs').target
    let p = new Promise((resolve, reject) => {
      window.fetch(url).then(
          function (response) {
            let text = response.text()
            resolve(text)
          }
        ).catch((error) => {
          reject(error)
        })
    })
    return p.then((result) => {
      let def = new Definition(result, targetLanguage, 'text/html')
      return ResourceProvider.getProxy(this.provider, def)
    })
  }

  /**
   * @override BaseLexiconAdapter#lookupShortDef
   */
  async lookupShortDef (lemma = null) {
    if (this.data === null) {
      let url = this.getConfig('urls').short
      let unparsed = await this._loadData(url)
      let parsed = papaparse.parse(unparsed, {})
      this.data = new Map(parsed.data)
    }
    let model = LanguageModelFactory.getLanguageForCode(lemma.language)
    let deftext = this._lookupInDataIndex(this.data, lemma, model)
    return new Promise((resolve, reject) => {
      let def = new Definition(deftext, this.getConfig('langs').target, 'text/plain')
      resolve(ResourceProvider.getProxy(this.provider, def))
    })
  }

  /**
   * Lookup a Lemma object in an Alpheios v1 data index
   * @param {Map} data the data inddex
   * @param {Lemma} lemma the lemma to lookupInDataIndex
   * @param {LanguageModel} model a language model for language specific methods
   * @return {string} the index entry as a text string
   */
  _lookupInDataIndex (data, lemma, model) {
    // legacy behavior from Alpheios lemma data file indices
    // first look to see if we explicitly have an instance of this lemma
    // with capitalization retained
    let found

    let alternatives = []
    let altEncodings = []
    for (let l of [lemma.word, ...lemma.principalParts]) {
      alternatives.push(l)
      for (let a of model.alternateWordEncodings(l)) {
        // we gather altEncodings separately because they should
        // be tried last after the lemma and principalParts in their
        // original form
        altEncodings.push(a)
      }
      let nosense = l.replace(/_?\d+$/, '')
      if (l !== nosense) {
        alternatives.push(nosense)
      }
    }
    alternatives = [...alternatives, ...altEncodings]

    for (let lookup of alternatives) {
      found = data.get(lookup.toLocaleLowerCase())
      if (found === '@') {
        found = data.get(`@${lookup}`)
      }
      if (found) {
        break
      }
    }
    return found
  }

  /**
   * Loads a data file from a URL
   * @param {string} url - the url of the file
   * @returns {Promise} a Promise that resolves to the text contents of the loaded file
   */
  _loadData (url) {
    // TODO figure out best way to load this data
    return new Promise((resolve, reject) => {
      window.fetch(url).then(
          function (response) {
            let text = response.text()
            resolve(text)
          }
        ).catch((error) => {
          reject(error)
        })
    })
  }

  /**
   * Get a configuration setting for this lexicon client instance
   * @param {string} property
   * @returns {string} the value of the property
   */
  getConfig (property) {
    return this.config[property]
  }

  /**
   * @override BaseAdapter#getLexicons
   */
  static getLexicons (language) {
    let fullconfig
    let lexicons = new Map()
    try {
      fullconfig = JSON.parse(DefaultConfig)
    } catch (e) {
      fullconfig = DefaultConfig
    }
    for (let l of Object.keys(fullconfig)) {
      if (fullconfig[l].langs.source === language) {
        lexicons.set(l, fullconfig[l].description)
      }
    }
    return lexicons
  }
}
export default AlpheiosLexAdapter