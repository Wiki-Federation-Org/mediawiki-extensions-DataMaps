module.exports = class EventEmitter {
    constructor() {
        this._handlers = {};
        this._autoFiringEvents = {};
    }


    /**
     * Registers an event handler.
     * 
     * If an event is set to fire immediately with memorised arguments, the handler will be invoked right away and won't
     * be enqueued for the next time.
     * @param {string} event 
     * @param {Function} callback 
     * @param {object?} context 
     */
    on( event, callback, context ) {
        if ( !this._handlers[event] ) {
            this._handlers[event] = [];
        }

        const handler = {
            context,
            method: callback
        };
        if ( this._autoFiringEvents[event] ) {
            // Event marked to set off right away with persistent parameters, invoke the handler now
            this._invokeEventHandler( handler, this._autoFiringEvents[event] );
        } else {
            // Event requires manual set-off, push the handler onto the list
            this._handlers[event].push( handler );
        }
    }


    /**
     * Deregisters all event handlers with the same callback. If no callback function is given, clears ALL handlers for
     * the event.
     * @param {string} event Event name.
     * @param {Function?} callback
     * @param {object?} context 
     */
    off( event, callback, context ) {
        // If no callback function given, remove all bound handlers
        if ( !callback ) {
            delete this._handlers[event];
            return;
        }

        // If event has any bound handlers, drop those with matching callback function
        if ( this._handlers[event] ) {
            this._handlers[event] = this._handlers[event].filter( x => x.method != callback && ( !context
                || x.context === context ) );

            // If no handlers left, drop the list entirely
            if ( this._handlers[event].length == 0 ) {
                delete this._handlers[event];
            }
        }
    }


    _invokeEventHandler( handler, args ) {
        try {
            handler.method.apply( handler.context, args );
        } catch ( error ) {
            // If a listener throws an exception, do not disrupt the emitter's routine, and rethrow the exception later
            setTimeout( () => {
                throw error;
            } );
        }
    }


    /**
     * Invokes all bound event handlers with given arguments.
     * @param {string} event Event name.
     */
    fire( event ) {
        if ( !this._handlers[event] ) {
            return;
        }

        const args = Object.values( arguments ).slice( 1 );
        for ( const handler of this._handlers[event] ) {
            this._invokeEventHandler( handler, args );
        }
    }


    /**
     * Invokes all bound event handlers and saves given arguments to invoke any future handler right away.
     * 
     * All handlers already bound are invoked and dropped.
     * @param {string} event Event name.
     */
    fireMemorised( event ) {
        this._autoFiringEvents[event] = Object.values( arguments ).slice( 2 );
        this.fire.apply( this, [ event ].concat( this._autoFiringEvents[event] ) );
        this.off( event );
    }
}