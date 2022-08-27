<?php
namespace MediaWiki\Extension\Ark\DataMaps\Rendering;

use Title;
use Parser;
use ParserOptions;
use MapCacheLRU;
use MediaWiki\MediaWikiServices;
use MediaWiki\Extension\Ark\DataMaps\DataMapsConfig;
use MediaWiki\Extension\Ark\DataMaps\Data\DataMapSpec;
use MediaWiki\Extension\Ark\DataMaps\Data\MarkerSpec;
use MediaWiki\Extension\Ark\DataMaps\Rendering\Utils\DataMapFileUtils;

class MarkerProcessor {
    const POPUP_IMAGE_WIDTH = 240;
    const MAX_LRU_SIZE = 128;
    
    private Parser $parser;
    private ParserOptions $parserOptions;
    private Title $title;
    private DataMapSpec $dataMap;
    private ?array $filter;

    private bool $isParserDirty = true;
    private bool $useLocalParserCache = true;
    private ?MapCacheLRU $localParserCache = null;

    private bool $collectTimings = false;
    public $timeInParser = 0;

    public function __construct( Title $title, DataMapSpec $dataMap, ?array $filter ) {
        $this->parser = MediaWikiServices::getInstance()->getParser();
        $this->parserOptions = ParserOptions::newCanonical( 'canonical' );
        $this->title = $title;
        $this->dataMap = $dataMap;
        $this->filter = $filter;
        // Pull configuration options
        $this->useLocalParserCache = DataMapsConfig::shouldCacheWikitextInProcess();
        $this->collectTimings = DataMapsConfig::shouldApiReturnProcessingTime();
        // Initialise the LRU
        if ( $this->useLocalParserCache ) {
            $this->localParserCache = new MapCacheLRU( self::MAX_LRU_SIZE );
        }
        // Configure the wikitext parser
        $this->parserOptions->enableLimitReport( false );
        $this->parserOptions->setAllowSpecialInclusion( false );
        $this->parserOptions->setExpensiveParserFunctionLimit( 0 );
        $this->parserOptions->setInterwikiMagic( false );
        $this->parserOptions->setMaxIncludeSize( DataMapsConfig::getParserExpansionLimit() );
    }

    public function processAll(): array {
        $results = [];

        // Creating a marker model backed by an empty object, as it will later get reassigned to actual data to avoid
        // creating thousands of small, very short-lived (only one at a time) objects
        $marker = new MarkerSpec( new \stdclass() );
        
        $this->dataMap->iterateRawMarkerMap( function ( string $layers, array $rawCollection ) use ( &$results, &$marker ) {
            // If filters were specified, check if there is any overlap between the filters list and skip the marker set
            if ( $this->filter !== null && empty( array_intersect( $this->filter, explode( ' ', $layers ) ) ) ) {
                return;
            }

            $subResults = [];
            foreach ( $rawCollection as &$rawMarker ) {
                $marker->reassignTo( $rawMarker );
                $subResults[] = $this->processOne( $marker );
            }
            $results[$layers] = $subResults;
        } );

        return $results;
    }

    public function processOne( MarkerSpec $marker ): array {
        // Flag parser state as requiring a cleaning
        $this->isParserDirty = true;
        // Coordinates
        $converted = [
            $marker->getLatitude(),
            $marker->getLongitude()
        ];
        // Rich data
        $slots = [];

        // Custom persistent ID
        if ( $marker->getCustomPersistentId() != null ) {
            $slots['uid'] = $marker->getCustomPersistentId();
        }

        // Popup title
        if ( $marker->getLabel() != null ) {
            $slots['label'] = $this->parseText( $marker, $marker->getLabel() );
        }

        // Popup description
        if ( $marker->getDescription() != null ) {
            $slots['desc'] = $this->parseMultilineText( $marker, $marker->getDescription() );
        }

        // Popup image thumbnail link
        if ( $marker->getPopupImage() != null ) {
            $slots['image'] = DataMapFileUtils::getFileUrl( $marker->getPopupImage(), self::POPUP_IMAGE_WIDTH );
        }

        // Related article title
        if ( $marker->getRelatedArticle() != null ) {
            $slots['article'] = $marker->getRelatedArticle();
        }

        // Search keywords
        if ( $marker->getSearchKeywords() != null ) {
            $keywords = $marker->getSearchKeywords();
            if ( is_array( $keywords ) ) {
                $keywords = implode( ' ', $keywords );
            }
            $slots['search'] = $keywords;
        }

        // Insert slots if any data has been added
        if ( !empty( $slots ) ) {
            $converted[] = $slots;
        }

        return $converted;
    }

    private function shouldParseString( MarkerSpec $marker, string $text ): bool {
        $mIsWikitext = $marker->isWikitext();
        if ( $mIsWikitext === false ) {
            return false;
        }
        return $mIsWikitext || preg_match( "/\{\{|\[\[|\'\'|<\w+|&[\d\w]+/", $text ) === 1;
    }

    private function parseWikitext( string $text ): string {
        // Look up in local cache if enabled
        if ( $this->useLocalParserCache && $this->localParserCache->has( $text ) ) {
            return $this->localParserCache->get( $text );
        }

        $timeStart = 0;
        if ( $this->collectTimings ) {
            $timeStart = hrtime( true );
        }

        // Call the parser
        $out = $this->parser->parse( $text, $this->title, $this->parserOptions, false, $this->isParserDirty )
            ->getText( [ 'unwrap' => true ] );
        // Mark as clean to avoid clearing state again
        $this->isParserDirty = false;

        if ( $this->collectTimings ) {
            $this->timeInParser += hrtime( true ) - $timeStart;
        }
        
        // Store in local cache if enabled
        if ( $this->useLocalParserCache ) {
            $this->localParserCache->set( $text, $out );
        }

        return $out;
    }

    private function parseText( MarkerSpec $marker, string $text ): string {
        if ( $this->shouldParseString( $marker, $text ) ) {
            return $this->parseWikitext( $text );
        }
        return wfEscapeWikiText( $text );
    }

    private function parseMultilineText( MarkerSpec $marker, /*array|string*/ $text ): string {
        if ( is_array( $text ) ) {
            $text = implode( "\n", $text );
        }
        return $this->parseText( $marker, $text );
    }
}