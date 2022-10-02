const MapStorage = require( './storage.js' ),
    Enums = require( './enums.js' ),
    MarkerLayerManager = require( './layerManager.js' ),
    MarkerPopup = require( './popup.js' ),
    MapLegend = require( './legend.js' ),
    MarkerLegendPanel = require( './markerLegend.js' ),
    EventEmitter = require( './events.js' ),
    DismissableMarkersLegend = require( './dismissables.js' ),
    Util = require( './util.js' ),
    mwApi = new mw.Api();


function DataMap( id, $root, config ) {
    EventEmitter.call( this );

    this.id = id;
    // Root DOM element of the data map
    this.$root = $root;
    // Setup configuration
    this.config = config;
    // Local storage driver
    this.storage = new MapStorage( this );
    this.globalStorage = new MapStorage( this, 'global' );
    // Layering driver
    this.layerManager = new MarkerLayerManager( this );
    // Information of currently set background
    this.background = null;
    this.backgroundIndex = 0;
    // Data set filters
    this.dataSetFilters = this.$root.data( 'filter-groups' ) || null;
    if ( this.dataSetFilters ) {
        this.dataSetFilters = this.dataSetFilters.split( '|' );
    }
    //
    this.$status = $root.find( '.datamap-status' );
    // MapLegend instance
    this.legend = null;
    // Leaflet.Map instance
    this.leaflet = null;
    // Collection of Leaflet.Icons by group
    this.iconCache = {};
    // DOM element of the coordinates display control
    this.$coordTracker = null;
    // Cached value of the 'datamap-coordinate-control-text' message
    this.coordTrackingMsg = mw.msg( 'datamap-coordinate-control-text' );
    // Retrieve a `marker` parameter from the query string if one is present
    this.markerIdToAutoOpen = null;
    const tabberId = this.getParentTabberNeueId();
    if ( !tabberId || ( tabberId && tabberId == window.location.hash.substr( 1 ) ) ) {
        this.markerIdToAutoOpen = Util.getQueryParameter( 'marker' );
    }

    // Coordinate reference system
    // If coordinate space spec is oriented [ lower lower upper upper ], assume top left corner as origin point (latitude will
    // be flipped). If [ upper upper lower lower ], assume bottom left corner (latitude will be unchanged). Any other layout is
    // invalid.
    if ( !this.config.crs ) {
        this.config.crs = [ [ 0, 0 ], [ 100, 100 ] ];
    }
    this.crsOrigin = ( this.config.crs[0][0] < this.config.crs[1][0] && this.config.crs[0][1] < this.config.crs[1][1] )
        ? Enums.CRSOrigin.TopLeft : Enums.CRSOrigin.BottomLeft;
    // Y axis is authoritative, this is really just a cosmetic choice influenced by ARK (latitude first). X doesn't need to be
    // mapped on a separate scale from Y, unless we want them to always be squares.
    let crsYHigh = Math.max( this.config.crs[0][0], this.config.crs[1][0] );
    this.crsScaleX = this.crsScaleY = 100 / crsYHigh;

    // Set up internal event handlers
    this.on( 'markerReady', this.tryOpenUriPopup, this );
    this.on( 'streamingDone', this.refreshMaxBounds, this );

    // Request OOUI to be loaded and build the legend
    if ( !this.isFeatureBitSet( this.FF_HIDE_LEGEND ) ) {
        mw.loader.using( [
            'oojs-ui-core',
            'oojs-ui-widgets'
        ], buildLegend.bind( this ) );
    }

    // Prepare the Leaflet map view
    mw.loader.using( [
        'ext.ark.datamaps.leaflet.core',
        'ext.ark.datamaps.leaflet.extra'
    ], buildLeafletMap.bind( this, this.$root.find( '.datamap-holder' ) ) );

    // Load search add-on
    if ( this.isFeatureBitSet( this.FF_SEARCH ) ) {
        mw.loader.using( [
            'oojs-ui-core',
            'ext.ark.datamaps.styles.search',
            'ext.ark.datamaps.search'
        ] );
    }
}


DataMap.prototype = Object.create( EventEmitter.prototype );


DataMap.prototype.anchors = {
    bottomLeft: '.leaflet-bottom.leaflet-left',
    topRight: '.leaflet-top.leaflet-right',
    topLeft: '.leaflet-top.leaflet-left'
};
DataMap.prototype.BOUNDS_PADDING = [ 150, 200 ];
DataMap.prototype.FF_SHOW_COORDINATES = 1<<0;
DataMap.prototype.FF_HIDE_LEGEND = 1<<1;
DataMap.prototype.FF_DISABLE_ZOOM = 1<<2;
DataMap.prototype.FF_SEARCH = 1<<3;
DataMap.prototype.FF_SORT_CHECKLISTS_BY_AMOUNT = 1<<4;


DataMap.prototype.isFeatureBitSet = function ( mask ) {
    return Util.isBitSet( this.config.flags, mask );
};


/*
 * Runs the callback function when the Leaflet map is initialised. This is required if a function/gadget depends on any
 * Leaflet code (global L) having been loaded.
 */
DataMap.prototype.waitForLeaflet = function ( callback, context ) {
    if ( this.leaflet == null ) {
        this.on( 'leafletLoaded', callback, context );
    } else {
        callback.call( context );
    }
};


DataMap.prototype.waitForLegend = function ( callback, context ) {
    if ( this.legend == null ) {
        this.on( 'legendLoaded', callback, context );
    } else {
        callback.call( context );
    }
};


DataMap.prototype.getParentTabberNeueId = function () {
    const $panel = this.$root.closest( 'article.tabber__panel' );
    return $panel.length > 0 ? ( $panel.attr( 'id' ) || $panel.attr( 'title' ).replace( ' ', '_' ) ) : null;
};


/*
 * Returns true if a layer is used on the map.
 */
DataMap.prototype.isLayerUsed = function ( name ) {
    return this.config.layerIds.indexOf( name ) >= 0;
};


/*
 * 
 */
DataMap.prototype.translatePoint = function ( point ) {
    return this.crsOrigin == Enums.CRSOrigin.TopLeft
        ? [ ( this.config.crs[1][0] - point[0] ) * this.crsScaleY, point[1] * this.crsScaleX ]
        : [ point[0] * this.crsScaleY, point[1] * this.crsScaleX ];
};


DataMap.prototype.translateBox = function ( box ) {
    return this.crsOrigin == Enums.CRSOrigin.TopLeft
        ? [ [ ( this.config.crs[1][0] - box[0][0] ) * this.crsScaleY, box[0][1] * this.crsScaleX ],
            [ ( this.config.crs[1][0] - box[1][0] ) * this.crsScaleY, box[1][1] * this.crsScaleX ] ]
        : [ [ box[0][0] * this.crsScaleY, box[0][1] * this.crsScaleX ],
            [ box[1][0] * this.crsScaleY, box[1][0] * this.crsScaleX ] ];
};


/*
 * Returns a formatted datamap-coordinate-control-text message.
 */
DataMap.prototype.getCoordLabel = function ( latOrInstance, lon ) {
    if ( Array.isArray( latOrInstance ) ) {
        lon = latOrInstance[1];
        latOrInstance = latOrInstance[0];
    }
    return this.coordTrackingMsg.replace( '$1', latOrInstance.toFixed( 2 ) ).replace( '$2', lon.toFixed( 2 ) );
};


DataMap.prototype.getStorageForMarkerGroup = function ( group ) {
    return Util.isBitSet( group.flags, Enums.MarkerGroupFlags.Collectible_GlobalGroup ) ? this.globalStorage : this.storage;
};


DataMap.prototype.toggleMarkerDismissal = function ( leafletMarker ) {
    const groupId = leafletMarker.attachedLayers[0];
    const isIndividual = Util.getGroupCollectibleType( this.config.groups[groupId] )
        === Enums.MarkerGroupFlags.Collectible_Individual,
        storage = this.getStorageForMarkerGroup( this.config.groups[groupId] );
    const state = storage.toggleDismissal( isIndividual ? Util.getMarkerId( leafletMarker ) : groupId, !isIndividual );
    if ( isIndividual ) {
        // Update this marker only
        leafletMarker.setDismissed( state );
        this.fire( 'markerDismissChange', leafletMarker );
    } else {
        // Update every marker in the group
        for ( const otherLeafletMarker of this.layerManager.byLayer[groupId] ) {
            otherLeafletMarker.setDismissed( state );
            this.fire( 'markerDismissChange', otherLeafletMarker );
        }
    }
    return state;
};


/*
 * Called whenever a marker is instantiated
 */
DataMap.prototype.tryOpenUriPopup = function ( leafletMarker ) {
    // Open this marker's popup if that's been requested via a `marker` query parameter
    if ( this.markerIdToAutoOpen != null && Util.getMarkerId( leafletMarker ) === this.markerIdToAutoOpen ) {
        leafletMarker.openPopup();
    }
};


DataMap.prototype.getIconFromLayers = function ( layers ) {
    const markerType = layers.join( ' ' );
    if ( !this.iconCache[markerType] ) {
        const group = this.config.groups[layers[0]];

        let markerIcon = group.markerIcon;
        const override = layers.find( x => this.config.layers[x] && this.config.layers[x].markerIcon );
        if ( override ) {
            markerIcon = this.config.layers[override].markerIcon;
        }
    
        this.iconCache[markerType] = L.icon( { iconUrl: markerIcon, iconSize: group.size } );
    }

    return this.iconCache[markerType];
};


DataMap.prototype.createMarkerFromApiInstance = function ( layers, instance ) {
    const group = this.config.groups[layers[0]],
        position = this.translatePoint( instance );
    let leafletMarker;

    // Construct the marker
    if ( group.markerIcon ) {
        // Fancy icon marker
        leafletMarker = new L.Ark.IconMarker( position, {
            icon: this.getIconFromLayers( layers )
        } );
    } else {
        // Circular marker
        leafletMarker = new L.Ark.CircleMarker( position, {
            baseRadius: group.size/2,
            expandZoomInvEx: group.extraMinZoomSize,
            fillColor: group.fillColor,
            fillOpacity: 0.7,
            color: group.strokeColor || group.fillColor,
            weight: group.strokeWidth || 1
        } );
    }

    // Initialise state if it's missing
    if ( !instance[2] ) {
        instance[2] = {};
    }

    // Persist original coordinates and state
    leafletMarker.apiInstance = instance;

    // Add marker to the layer
    this.layerManager.addMember( layers, leafletMarker );

    // Update dismissal status if storage says it's been dismissed
    const collectibleMode = Util.getGroupCollectibleType( group );
    if ( collectibleMode ) {
        const isIndividual = collectibleMode == Enums.MarkerGroupFlags.Collectible_Individual,
            storage = this.getStorageForMarkerGroup( group );
        leafletMarker.setDismissed( storage.isDismissed( isIndividual ? Util.getMarkerId( leafletMarker ) : layers[0],
            !isIndividual ) );
    }

    // Bind a popup building closure (this is more efficient than binds)
    MarkerPopup.bindTo( this, leafletMarker );

    return leafletMarker;
};


DataMap.prototype.createMarker = function ( layers, position, state ) {
    return this.createMarkerFromApiInstance( layers, [ position[0], position[1], state ] );
};


/*
 * Builds markers from a data object
 */
DataMap.prototype.instantiateMarkers = function ( data ) {
    // Register all layers in this package
    for ( const markerType in data ) {
        markerType.split( ' ' ).forEach( name => this.layerManager.register( name ) );
    }
    
    // Unpack markers
    for ( const markerType in data ) {
        const layers = markerType.split( ' ' );
        const placements = data[markerType];
        // Create markers for instances
        for ( const instance of placements ) {
            this.fire( 'markerReady', this.createMarkerFromApiInstance( layers, instance ) );
        }
    }

    this.fire( 'streamingDone' );
};


DataMap.prototype.streamMarkersIn = function ( pageName, version, filter, successCallback, errorCallback, retryCount ) {
    const query = {
        action: 'queryDataMap',
        title: pageName
    };
    if ( version ) {
        query.revid = version;
    }
    if ( filter ) {
        query.filter = filter.join( '|' );
    }
    if ( retryCount == null ) {
        retryCount = 2;
    }

    return mwApi.get( query ).then(
        data => {
            if ( data.error ) {
                errorCallback();
            } else {
                this.waitForLeaflet( () => {
                    this.instantiateMarkers( data.query.markers );
                    successCallback();
                } );
            }
        },
        () => {
            if ( retryCount <= 0 ) {
                errorCallback();
            } else {
                console.warn( 'Retrying marker chunk loading' );
                this.streamMarkersIn( pageName, version, filter, successCallback, errorCallback, retryCount - 1 );
            }
        }
    );
};


/*
 * 
 */
DataMap.prototype.setCurrentBackground = function ( index ) {
    // Remove existing layers off the map
    if ( this.background ) {
        this.background.layers.forEach( x => x.remove() );
        this.background = null;
    }

    // Check if index is valid, and fall back to first otherwise
    if ( index < 0 || index >= this.config.backgrounds.length ) {
        index = 0;
    }

    // Update state
    this.background = this.config.backgrounds[ index ];
    this.backgroundIndex = index;

    // Push layers back onto the map
    this.background.layers.forEach( x => {
        x.addTo( this.leaflet );
        x.bringToBack();
    } );

    // Hide any unmatching "bg" sub-layer
    this.layerManager.setOptionalPropertyRequirement( 'bg', this.background.layer );
};


DataMap.prototype.updateMarkerScaling = function () {
    const zoom = this.leaflet.getZoom();
    this.leaflet.options.markerScaleI = zoom / this.leaflet.options.minZoom;
    this.leaflet.options.markerScaleA = zoom / this.leaflet.options.maxZoom;
};


DataMap.prototype.restoreDefaultView = function () {
    this.leaflet.setZoom( this.leaflet.options.minZoom );
    this.leaflet.fitBounds( this.translateBox( this.background.at ) );
};


DataMap.prototype.centreView = function () {
    const box = this.translateBox( this.background.at );
    this.leaflet.setView( [ (box[1][0] + box[0][0])/2, (box[1][1] + box[0][1])/2 ] );
};


DataMap.prototype.addControl = function ( anchor, $element, shouldPrepend ) {
    this.$root.find( `.leaflet-control-container ${anchor}` )[ shouldPrepend ? 'prepend' : 'append' ]( $element );
    return $element;
};


DataMap.prototype.buildBackgroundOverlayObject = function ( overlay ) {
    let result;

    // Construct a layer
    if ( overlay.image ) {
        // Construct an image
        result = L.imageOverlay( overlay.image, this.translateBox( overlay.at ) );
    } else if ( overlay.path ) {
        // Construct a polyline
        result = L.polyline( overlay.path.map( p => this.translatePoint( p ) ), {
            color: overlay.colour || L.Path.prototype.options.color,
            weight: overlay.thickness || L.Path.prototype.options.weight
        } );
    } else {
        // Construct a rectangle
        result = L.rectangle( this.translateBox( overlay.at ), {
            color: overlay.strokeColour || L.Path.prototype.options.color,
            fillColor: overlay.colour || L.Path.prototype.options.fillColor
        } );
    }

    // Bind name as tooltip
    if ( overlay.name ) {
        result.bindTooltip( overlay.name );
    }

    return result;
};


DataMap.prototype.refreshMaxBounds = function () {
	const bounds = new L.LatLngBounds();
    // Collect content bounds
	for ( const id in this.leaflet._layers ) {
		const layer = this.leaflet._layers[id];
        if ( layer.getBounds || layer.getLatLng ) {
		    bounds.extend( layer.getBounds ? layer.getBounds() : layer.getLatLng() );
        }
	}
    // Add padding
    const nw = bounds.getNorthWest(),
        se = bounds.getSouthEast();
    bounds.extend( [ [ se.lat - this.BOUNDS_PADDING[0], se.lng + this.BOUNDS_PADDING[1] ],
        [ nw.lat + this.BOUNDS_PADDING[0], nw.lng - this.BOUNDS_PADDING[1] ] ] );
    // Update Leaflet instance
    this.leaflet.setMaxBounds( bounds );
};


const buildLeafletMap = function ( $holder ) {
    // If FF_DISABLE_ZOOM is set, prevent all kind of zooming
    if ( this.isFeatureBitSet( this.FF_DISABLE_ZOOM ) ) {
        this.config.leafletSettings = $.extend( {
            zoomControl: false,
            boxZoom: false,
            doubleClickZoom: false,
            scrollWheelZoom: false,
            touchZoom: false,
            maxZoom: 2.75,
            minZoom: 2.75,
            zoom: 2.75
        }, this.config.leafletSettings || {} );
    }

    // Prepare settings for Leaflet
    const leafletConfig = $.extend( true, {
        // Boundaries
        center: [ 50, 50 ],
        maxBounds: [ [ -100, -100 ], [ 200, 200 ] ],
        maxBoundsViscosity: 0.7,
        // Zoom settings
        zoomSnap: 0.25,
        zoomDelta: 0.25,
        maxZoom: 5,
        wheelPxPerZoomLevel: 240,
        minZoom: L.Browser.mobile ? ( L.Browser.retina ? 1 : 1.75 ) : 2,
        // Zoom animation causes some awkward locking as Leaflet waits for the animation to finish before processing more zoom
        // requests, but disabling it causes some updates to be distorted (for example, the canvas renderer will drift).
        // We include a patch in our Leaflet builds to disable animations on desktop-style zooms.
        zoomAnimation: true,
        markerZoomAnimation: true,
        // Do not allow pinch-zooming to surpass max zoom even temporarily. This seems to cause a mispositioning.
        bounceAtZoomLimits: false,
        // Pan settings
        inertia: false,
        // Zoom-based marker scaling
        shouldExpandZoomInvEx: true,
        expandZoomInvEx: 1.8,
        // Canvas renderer settings - using canvas for performance with padding of 1/3rd (to draw some more markers outside of
        // view for panning UX)
        preferCanvas: true,
        rendererSettings: {
            padding: 1/3
        },
    }, this.config.leafletSettings );
    // Specify the coordinate reference system and initialise the renderer
    leafletConfig.crs = L.CRS.Simple;
    leafletConfig.renderer = L.canvas( leafletConfig.rendererSettings );

    // Initialise the Leaflet map
    this.leaflet = L.map( $holder.get( 0 ), leafletConfig );

    // Prepare all backgrounds
    this.config.backgrounds.forEach( ( background, index ) => {
        background.layers = [];

        // Set the associated layer name
        background.layer = background.layer || index;

        // Image overlay:
        // Latitude needs to be flipped as directions differ between Leaflet and ARK
        background.at = background.at || this.config.crs;
        background.layers.push( L.imageOverlay( background.image, this.translateBox( background.at ) ) );

        // Prepare overlay layers
        if ( background.overlays ) {
            background.overlays.forEach( overlay => background.layers.push( this.buildBackgroundOverlayObject( overlay ) ) );
        }
    } );
    // Switch to the last chosen one or first defined
    this.setCurrentBackground( this.storage.get( 'background' ) || 0 );
    // Update max bounds
    this.refreshMaxBounds();
    // Restore default view
    this.restoreDefaultView();

    for ( const groupName in this.config.groups ) {
        const group = this.config.groups[groupName];

        // Register with the layer manager
        this.layerManager.register( groupName );

        if ( Util.isBitSet( group.flags, Enums.MarkerGroupFlags.IsUnselected ) ) {
            this.layerManager.setExclusion( groupName, true );
        }
    }

    // Recalculate marker sizes when zoom ends
    this.leaflet.on( 'zoom', () => this.updateMarkerScaling() );
    this.updateMarkerScaling();

    // Build extra controls
    buildControls.call( this );

    this.fire( 'leafletLoaded' );
    this.off( 'leafletLoaded' );
};


const buildControls = function () {
    // Create a coordinate-under-cursor display
    if ( this.isFeatureBitSet( this.FF_SHOW_COORDINATES ) ) {
        this.$coordTracker = this.addControl( this.anchors.bottomLeft,
            $( '<div class="leaflet-control datamap-control datamap-control-coords">' ) );
        this.leaflet.on( 'mousemove', event => {
            let lat = event.latlng.lat / this.crsScaleY;
            let lon = event.latlng.lng / this.crsScaleX;
            if ( this.crsOrigin == Enums.CRSOrigin.TopLeft )
                lat = this.config.crs[1][0] - lat;
            this.$coordTracker.text( this.getCoordLabel( lat, lon ) );
        } );
    }

    // Create a background toggle
    if ( this.config.backgrounds.length > 1 ) {
        this.$backgroundSwitch = this.addControl( this.anchors.topRight,
            $( '<select class="leaflet-control datamap-control datamap-control-backgrounds leaflet-bar">' )
            .on( 'change', () => {
                this.setCurrentBackground( this.$backgroundSwitch.val() );
                // Remember the choice
                this.storage.set( 'background', this.$backgroundSwitch.val() );
            } )
        );
        this.config.backgrounds.forEach( ( background, index ) => {
            $( '<option>' ).attr( 'value', index ).text( background.name ).appendTo( this.$backgroundSwitch );
        } );
        this.$backgroundSwitch.val( this.backgroundIndex );
    }

    // Extend zoom control to add buttons to reset or centre the view
    const $viewControls = this.addControl( this.anchors.topLeft,
        $( '<div class="leaflet-control datamap-control leaflet-bar datamap-control-viewcontrols">' ) );
    $viewControls.append(
        $( '<a role="button" class="datamap-control-viewreset" aria-disabled="false"><span class="oo-ui-icon-fullScreen">'
            + '</span></a>' )
        .attr( {
            title: mw.msg( 'datamap-control-reset-view' ),
            'aria-label': mw.msg( 'datamap-control-reset-view' )
        } )
        .on( 'click', () => this.restoreDefaultView() )
    );
    $viewControls.append(
        $( '<a role="button" class="datamap-control-viewcentre" aria-disabled="false"><span class="oo-ui-icon-exitFullscreen">'
            + '</span></a>' )
        .attr( {
            title: mw.msg( 'datamap-control-centre-view' ),
            'aria-label': mw.msg( 'datamap-control-centre-view' )
        } )
        .on( 'click', () => this.centreView() )
    );
};


const buildLegend = function () {
    // Determine if we'll need a layer dropdown
    const hasCaves = this.isLayerUsed( 'cave' );
    const withLayerDropdown = hasCaves;

    // Initialise legend objects
    this.legend = new MapLegend( this );
    this.markerLegend = new MarkerLegendPanel( this.legend, mw.msg( 'datamap-legend-tab-locations' ), true, withLayerDropdown );

    // Build the surface and caves toggle
    if ( hasCaves ) {
        this.markerLegend.addMarkerLayerToggleRequired( this.markerLegend.$layersPopup, 'cave', mw.msg( 'datamap-layer-surface' ) );
        this.markerLegend.addMarkerLayerToggleExclusive( this.markerLegend.$layersPopup, 'cave', mw.msg( 'datamap-layer-cave' ) );
    }

    // Build individual group toggles
    for ( const groupId in this.config.groups ) {
        if ( !this.dataSetFilters || this.dataSetFilters.indexOf( groupId ) >= 0 ) {
            this.markerLegend.addMarkerGroupToggle( groupId, this.config.groups[groupId] );
        }
    }
    // Set up the dismissable marker interactions
    if ( Object.values( this.config.groups ).some( x => Util.getGroupCollectibleType( x ) ) ) {
        this.legend.dismissables = new DismissableMarkersLegend( this.legend );
    }

    this.fire( 'legendLoaded' );
    this.off( 'legendLoaded' );
};


module.exports = DataMap;