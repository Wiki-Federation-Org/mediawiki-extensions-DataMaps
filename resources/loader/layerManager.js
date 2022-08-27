function MarkerLayerManager( map ) {
    this.map = map;
    this.markers = [];
    this.byLayer = {};
    this.includeMaskHi = new Set();
    this.includeMaskLo = new Set();
    this.excludeMask = new Set();
    this.includeMaskPr = {};
    this.clearCache();
}


MarkerLayerManager.prototype.clearCache = function () {
    this.computeCache = {};
};


MarkerLayerManager.prototype.register = function ( layerName ) {
    if ( !this.byLayer[layerName] ) {
        this.byLayer[layerName] = [];
    }
};


MarkerLayerManager.prototype.addMember = function ( type, leafletMarker ) {
    leafletMarker.attachedLayers = type.split(' ');
    for ( const layer of leafletMarker.attachedLayers )
        this.byLayer[layer].push( leafletMarker );
    this.markers.push( leafletMarker );
    this.updateMember( leafletMarker );
};


MarkerLayerManager.prototype.addMarkerToLayer = function ( leafletMarker, layer ) {
    leafletMarker.attachedLayers.push( layer );
    this.byLayer[layer].push( leafletMarker );
    this.updateMember( leafletMarker );
};


MarkerLayerManager.prototype.removeMember = function ( leafletMarker ) {
    this.map.leaflet.removeLayer( leafletMarker );
    for ( const layer of leafletMarker.attachedLayers )
        delete this.byLayer[layer][this.byLayer[layer].indexOf( leafletMarker )];
    delete this.markers[this.markers.indexOf( leafletMarker )];
    leafletMarker.attachedLayers = null;
};


MarkerLayerManager.prototype.shouldBeVisible = function ( layers ) {
    // If requirement mask is not empty, and there is a layer inside the list does not have, return invisible
    if ( this.includeMaskHi.size > 0 && !( () => {
        let result = true;
        for ( const name of this.includeMaskHi ) {
            result = result && layers.indexOf( name ) > 0;
        }
        return result;
    } )() ) {
        return false;
    }

    // If inclusion mask is not empty, and there is no overlap between it and queried layers, return invisible
    if ( this.includeMaskLo.size > 0 && !layers.some( name => this.includeMaskLo.has( name ) ) ) {
        return false;
    }

    // If exclusion mask is not empty, and there is overlap between it and queried layers, return invisible
    if ( this.excludeMask.size > 0 && layers.some( name => this.excludeMask.has( name ) ) ) {
        return false;
    }

    // Compare against the property mask: if (and only if) there's a sub-layer with a differing value, return invisible
    for ( const property in this.includeMaskPr ) {
        // Check if this property is specified in the layers list
        if ( layers.some( name => name.indexOf( property + ':' ) >= 0 ) ) {
            // Check if the value is matched
            if ( layers.indexOf( `${property}:${this.includeMaskPr[property]}` ) < 0 ) {
                return false;
            }
        }
    }

    return true;
};


MarkerLayerManager.prototype.updateMember = function ( leafletMarker ) {
    // Exit early if updates are disabled
    if ( this.doNotUpdate ) {
        return;
    }
    // Get marker layers
    const layers = leafletMarker.attachedLayers;
    // Request new visibility state from cache, or compute it if missed
    let shouldBeVisible = this.computeCache[layers];
    if ( shouldBeVisible == null ) {
        shouldBeVisible = this.shouldBeVisible( layers );
        this.computeCache[layers] = shouldBeVisible;
    }
    // Add to Leaflet map if true, remove if false
    if ( shouldBeVisible )
        this.map.leaflet.addLayer( leafletMarker )
    else
        this.map.leaflet.removeLayer( leafletMarker );
};


MarkerLayerManager.prototype.updateMembers = function ( layerName ) {
    // Exit early if updates are disabled
    if ( this.doNotUpdate ) {
        return;
    }
    // Exit early if layer does not exist
    if ( layerName && !this.byLayer[layerName] ) {
        return;
    }
    // Run an update on every member of the layer
    for ( const m of ( layerName ? this.byLayer[layerName] : this.markers ) )
        this.updateMember( m );
};


/*
 * Sets a layer as *absolutely* required for a marker to be displayed. This updates ALL markers.
 */
MarkerLayerManager.prototype.setRequirement = function ( layerName, state ) {
    if ( state )
        this.includeMaskHi.add( layerName );
    else
        this.includeMaskHi.delete( layerName );
    this.clearCache();
    this.updateMembers();
};


/*
 * Sets a layer as *absolutely* required for a marker to be displayed. This updates ALL markers.
 */
MarkerLayerManager.prototype.setOptionalPropertyRequirement = function ( propertyName, value ) {
    if ( value == null && this.includeMaskPr[propertyName] ) {
        delete this.includeMaskPr[propertyName];
    } else if ( value != null ) {
        this.includeMaskPr[propertyName] = value;
    }
    this.clearCache();
    this.updateMembers();
};


/*
 * Sets a layer as required for a marker to be displayed. This updates ALL markers.
 */
MarkerLayerManager.prototype.setInclusion = function ( layerName, state ) {
    if ( state )
        this.includeMaskLo.add( layerName );
    else
        this.includeMaskLo.delete( layerName );
    this.clearCache();
    this.updateMembers();
};


/*
 * Sets a layer as preventing marker display. This updates only markers within the layer.
 */
MarkerLayerManager.prototype.setExclusion = function ( layerName, state ) {
    if ( state )
        this.excludeMask.add( layerName );
    else
        this.excludeMask.delete( layerName );
    this.clearCache();
    this.updateMembers( layerName );
};


MarkerLayerManager.prototype.setDeferVisibilityUpdates = function ( state ) {
    if ( !state && this.doNotUpdate !== state ) {
        // Updates are being enabled back on, force a visibility update
        this.doNotUpdate = state;
        this.updateMembers();
    }
    this.doNotUpdate = state;
};


module.exports = MarkerLayerManager;