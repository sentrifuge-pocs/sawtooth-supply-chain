/**
 * Copyright 2017 Intel Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * ----------------------------------------------------------------------------
 */

const m = require('mithril')

const api = require('../services/api')
const payloads = require('../services/payloads')
const transactions = require('../services/transactions')
const parsing = require('../services/parsing')
const forms = require('../components/forms')
const layout = require('../components/layout')
const types = require('../../sample_data/core_types.json')

/**
 * Possible selection options
 */
const authorizableProperties = [
  ['weight', 'Weight'],
  ['assay', 'Assay'],
  ['location', 'Location']
]

const PROCESSED_MINERALS = new Set([
  'Coltan Concentrate',
  'Gold Concentrate',
  'Gold Dore',
  'Refined Gold',
  'Tantalum'
])
const CHILD_TYPES = {
  'Coltan Ore': ['Coltan Concentrate'],
  'Coltan Concentrate': ['Tantalum'],
  'Gold Ore': ['Gold Concentrate'],
  'Gold Dore': ['Refined Gold']
}

const MINERAL_TYPES = types[0].properties[3].enumOptions
  .filter(t => !PROCESSED_MINERALS.has(t))
const STATUSES = types[0].properties[4].enumOptions
const CONTAINER_TYPES = types[0].properties[5].enumOptions
const ORIGINS = types[0].properties[6].enumOptions
const ZONES = types[0].properties[7].enumOptions

/**
 * The Form for tracking a new asset.
 */
const AddAssetForm = {
  oninit (vnode) {
    if (vnode.attrs.parentId) {
      api.get(`records/${vnode.attrs.parentId}`)
        .then(parent => {
          const props = parent.properties.reduce((props, { name, value }) => {
            props[name] = value
            return props
          }, {})

          vnode.state.parent = Object.assign({ props }, parent)
        })
    }
  },

  view (vnode) {
    const setter = forms.stateSetter(vnode.state)
    const { parent } = vnode.state
    const types = !parent
      ? MINERAL_TYPES
      : CHILD_TYPES[parent.props.type] || []

    if (parent) {
      vnode.state.origin = parent.props.origin
      vnode.state.zone = parent.props.zone
    }

    return [
      m('.add_asset_form',
        m('form', {
          onsubmit: (e) => {
            e.preventDefault()
            _handleSubmit(vnode.attrs.signingKey, vnode.state)
          }
        },
        m('legend', 'Add New Container'),
        layout.row([
          forms.textInput(setter('id'), 'Serial Number'),
          forms.textInput(setter('tag'), 'NFC Tag'),
        ]),

        !parent
          ? null
          : layout.row([
            forms.group('Parent Serial', m('.text-muted', parent.recordId)),
            forms.group('Parent Tag', m('.text-muted', parent.props.tag))
          ]),

        layout.row([
          forms.select(setter('type'), 'Mineral Type', types),
          forms.select(setter('status'), 'Status', STATUSES),
          forms.select(setter('container'), 'Container Type', CONTAINER_TYPES)
        ]),

        parent
          ? layout.row([
            forms.group('Country of Origin', m('.text-muted', vnode.state.origin)),
            forms.group('Zone', m('.text-muted', vnode.state.zone))
          ])
          : layout.row([
            forms.select(setter('origin'), 'Country of Origin', ORIGINS),
            forms.select(setter('zone'), 'Zone', ZONES)
          ]),

        layout.row([
          forms.group('Assay (%)', forms.field(setter('assay'), {
            type: 'number',
            step: 'any',
            min: 0,
            required: false
          })),
          forms.group('Weight (kg)', forms.field(setter('weight'), {
            type: 'number',
            step: 'any',
            min: 0,
            required: false
          }))
        ]),

        layout.row([
          forms.group('Latitude', forms.field(setter('latitude'), {
            type: 'number',
            step: 'any',
            min: -90,
            max: 90,
            required: false
          })),
          forms.group('Longitude', forms.field(setter('longitude'), {
            type: 'number',
            step: 'any',
            min: -180,
            max: 180,
            required: false
          }))
        ]),

        m('.row.justify-content-end.align-items-end',
          m('col-2',
            m('button.btn.btn-primary',
              'Add Container Record')))))
    ]
  }
}

/**
 * Handle the form submission.
 *
 * Extract the appropriate values to pass to the create record transaction.
 */
const _handleSubmit = (signingKey, state) => {
  const properties = [
    {
      name: 'tag',
      stringValue: state.tag,
      dataType: payloads.createRecord.enum.STRING
    },
    {
      name: 'type',
      enumValue: state.type,
      dataType: payloads.createRecord.enum.ENUM
    },
    {
      name: 'status',
      enumValue: state.status,
      dataType: payloads.createRecord.enum.ENUM
    },
    {
      name: 'container',
      enumValue: state.container,
      dataType: payloads.createRecord.enum.ENUM
    },
    {
      name: 'origin',
      enumValue: state.origin,
      dataType: payloads.createRecord.enum.ENUM
    },
    {
      name: 'zone',
      enumValue: state.zone,
      dataType: payloads.createRecord.enum.ENUM
    }
  ]

  if (state.parent) {
    properties.push({
      name: 'parent_id',
      stringValue: state.parent.recordId,
      dataType: payloads.createRecord.enum.STRING
    })

    properties.push({
      name: 'parent_tag',
      stringValue: state.parent.props.tag,
      dataType: payloads.createRecord.enum.STRING
    })
  }

  if (state.assay) {
    properties.push({
      name: 'assay',
      numberValue: parsing.toInt(state.assay / 100),
      dataType: payloads.createRecord.enum.NUMBER
    })
  }

  if (state.weight) {
    properties.push({
      name: 'weight',
      numberValue: parsing.toInt(state.weight),
      dataType: payloads.createRecord.enum.NUMBER
    })
  }

  if (state.latitude && state.longitude) {
    properties.push({
      name: 'location',
      locationValue: {
        latitude: parsing.toInt(state.latitude),
        longitude: parsing.toInt(state.longitude)
      },
      dataType: payloads.createRecord.enum.LOCATION
    })
  }

  const createPayloads = []

  if (state.parent) {
    createPayloads.push(payloads.finalizeRecord({
      recordId: state.parent.recordId
    }))
  }

  createPayloads.push(payloads.createRecord({
    recordId: state.id,
    recordType: 'mineral',
    properties
  }))

  transactions.submit(createPayloads, true)
    .then(() => m.route.set(`/assets/${state.id}`))
}

module.exports = AddAssetForm
