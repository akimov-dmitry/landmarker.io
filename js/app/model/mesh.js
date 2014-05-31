var _ = require('underscore');
var Backbone = require('backbone');
Backbone.$ = require('jquery');
var THREE = require('three');
var Asset = require('./asset');


"use strict";

var basicMaterial = new THREE.MeshPhongMaterial();
basicMaterial.transparent = true;


var Mesh = Backbone.Model.extend({

    defaults : {
        alpha : 1,
        up : new THREE.Vector3(0, 1, 0)
    },

    urlRoot: "meshes",

    initialize : function() {
        _.bindAll(this, 'changeAlpha');
        this.listenTo(this, "change:alpha", this.changeAlpha);
    },

    url: function () {
        return this.get('server').map(this.urlRoot + '/' + this.id);
    },

    up: function () {
        return this.get('up');
    },

    t_mesh: function () {
        return this.get('t_mesh');
    },

    alpha: function () {
        return this.get('alpha');
    },

    hasTexture: function() {
        return this.has('texture');
    },

    isTextureOn: function () {
        return this.hasTexture() && this.get('textureOn');
    },

    isWireframeOn: function () {
        return this.t_mesh().material.wireframe;
    },

    textureOn: function() {
        if (this.isTextureOn() || !this.hasTexture()) {
            return;  // texture already off or no texture
        }
        var wf = this.isWireframeOn();
        this.t_mesh().material = this.get('texture');
        if (wf) {
            this.wireframeOn();
        } else {
            this.wireframeOff();
        }
        this.changeAlpha();
        this.set('textureOn', true);
    },

    textureOff: function() {
        if (!this.isTextureOn()) {
            return;  // texture already on
        }
        var wf = this.isWireframeOn();
        this.t_mesh().material = basicMaterial;
        if (wf) {
            this.wireframeOn();
        } else {
            this.wireframeOff();
        }
        this.changeAlpha();
        this.set('textureOn', false);
    },

    textureToggle: function () {
        if (this.isTextureOn()) {
            this.textureOff();
        } else {
            this.textureOn();
        }
    },

    wireframeOn: function() {
        if (this.isWireframeOn()) {
            return;
        }
        this.t_mesh().material.wireframe = true;
        this.set('wireframeOn', true);
        this.changeAlpha();
    },

    wireframeOff: function() {
        if (!this.isWireframeOn()) {
            return;
        }
        this.t_mesh().material.wireframe = false;
        this.set('wireframeOn', false);
        this.changeAlpha();
    },

    wireframeToggle: function () {
        if (this.isWireframeOn()) {
            this.wireframeOff();
        } else {
            this.wireframeOn();
        }
    },

    toJSON: function () {
        var trilist = _.map(this.t_mesh().geometry.faces, function (face) {
            return [face.a, face.b, face.c];
        });

        var points = _.map(this.t_mesh().geometry.vertices, function (v) {
            return [v.x, v.y, v.z];
        });

        return {
            points: points,
            trilist: trilist
        };
    },

    changeAlpha: function () {
        this.t_mesh().material.opacity = this.get('alpha');
    },

    parse: function (response) {
        var geometry = new THREE.Geometry();
        _.each(response.points, function (v) {
            geometry.vertices.push(new THREE.Vector3(v[0], v[1], v[2]));
        });
        _.each(response.trilist, function (tl) {
            geometry.faces.push(new THREE.Face3(tl[0], tl[1], tl[2]));
        });
        var material;
        var result;
        var that = this;
        if (response.tcoords) {
            // this mesh has a texture - grab it
            var textureURL = this.get('server').map('textures/' +
                                                    this.id);
            material = new THREE.MeshPhongMaterial(
                {
                    map: THREE.ImageUtils.loadTexture(
                        textureURL, new THREE.UVMapping(),
                        function() {
                            that.trigger("textureSet");
                        } )
                }
            );
            material.transparent = true;
            // We expect per-vertex texture coords only. Three js has per
            // face tcoords, so we need to handle the conversion.
            // First - generate all the tcoords in a list
            var tcs = [];
            _.each(response.tcoords, function (tc) {
                tcs.push(new THREE.Vector2(tc[0], tc[1]));
            });
            // now index into them to build up the per-face uvs THREE js
            // uses
            var t; // the indices for the triangle in question
            for (var i = 0; i < geometry.faces.length; i++) {
                t = geometry.faces[i];
                geometry.faceVertexUvs[0].push(
                    [tcs[t.a], tcs[t.b], tcs[t.c]])
            }
            result = {
                t_mesh: new THREE.Mesh(geometry, material),
                texture: material,
                textureOn: true
            };
        } else {
            // default to basic Phong lighting
            result = {
                t_mesh: new THREE.Mesh(geometry, basicMaterial)
            };
        }
        // clean up the vertices
        geometry.mergeVertices();
        // needed for lighting to work
        geometry.computeFaceNormals();
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();

        return result;
    }

});

var MeshList = Backbone.Collection.extend({
    model: Mesh
});

// Holds a list of available meshes, and a MeshList. The MeshList
// is populated immediately, although meshes aren't fetched until demanded.
// Also has a mesh parameter - the currently active mesh.
var MeshSource = Asset.AssetSource.extend({

    url: function () {
        return this.get('server').map("meshes");
    },

    parse: function (response) {
        var that = this;
        var meshes = _.map(response, function (assetId) {
            return new Mesh({
                id: assetId,
                server: that.get('server')
            })
        });
        var meshList = new MeshList(meshes);
        return {
            assets: meshList
        };
    },

    setAsset: function (newMesh) {
        var that = this;
        _.each(this.pending, function (xhr) {
            xhr.abort();
        }, this);
        // the asset advances immediately.
        this.pending[newMesh.id] = newMesh.fetch({
            success: function () {
                console.log('grabbed new mesh');
                // once the mesh is downloaded, advance the mesh
                that.set('asset', newMesh);
                that.set('mesh', newMesh);
                delete that.pending[newMesh.id];
            }
        });
    }
});

exports.Mesh = Mesh;
exports.MeshList = MeshList;
exports.MeshSource = MeshSource;
