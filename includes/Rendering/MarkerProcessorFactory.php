<?php
namespace MediaWiki\Extension\DataMaps\Rendering;

use MapCacheLRU;
use MediaWiki\Config\ServiceOptions;
use MediaWiki\Extension\DataMaps\ConfigNames;
use MediaWiki\Extension\DataMaps\Data\DataMapSpec;
use MediaWiki\Extension\DataMaps\ExtensionConfig;
use Parser;
use ParserFactory;
use ParserOptions;
use Title;

final class MarkerProcessorFactory {
    public const SERVICE_NAME = 'DataMaps.MarkerProcessorFactory';

    private const MAX_LRU_SIZE = 128;

    /** @var ParserFactory */
    private ParserFactory $parserFactory;

    /** @var ExtensionConfig */
    private ExtensionConfig $config;

    /**
     * @param ParserFactory $parserFactory
     * @param ExtensionConfig $config
     */
    public function __construct(
        ParserFactory $parserFactory,
        ExtensionConfig $config
    ) {
        $this->parserFactory = $parserFactory;
        $this->config = $config;
    }

    /**
     * Returns parser options for marker wikitext expansion.
     *
     * @param ParserOptions|null $originalOptions Options to use the current revision callback from.
     * @return ParserOptions
     */
    public function createParserOptions( ?ParserOptions $originalOptions = null ): ParserOptions {
        $result = ParserOptions::newFromAnon();
        $result->setAllowSpecialInclusion( false );
        $result->setExpensiveParserFunctionLimit( 5 );
        $result->setInterwikiMagic( false );
        $result->setMaxIncludeSize( $this->config->getParserExpansionLimit() );

        if ( $originalOptions ) {
            $result->setCurrentRevisionRecordCallback( $originalOptions->getCurrentRevisionRecordCallback() );
        }

        return $result;
    }

    /**
     * Creates a processor instance using the provided wikitext parser instance.
     *
     * @param Parser $parser Wikitext parser to use.
     * @param Title $title Page reference to the map.
     * @param DataMapSpec $dataMap Map to process.
     * @param array|null $filter Layers to render.
     * @return MarkerProcessor
     */
    public function createUsingParser(
        Parser $parser,
        Title $title,
        DataMapSpec $dataMap,
        ?array $filter
    ): MarkerProcessor {
        $lru = null;
        if ( $this->config->shouldCacheWikitextInProcess() ) {
            $lru = new MapCacheLRU( self::MAX_LRU_SIZE );
        }

        return new MarkerProcessor(
            $parser,
            $this->createParserOptions( $parser->getOptions() ),
            $this->config,
            $lru,
            $title,
            $dataMap,
            $filter
        );
    }

    /**
     * Creates a processor instance with a parser instance acquired from the factory.
     *
     * @param Title $title Page reference to the map.
     * @param DataMapSpec $dataMap Map to process.
     * @param array|null $filter Layers to render.
     * @return MarkerProcessor
     */
    public function create(
        Title $title,
        DataMapSpec $dataMap,
        ?array $filter
    ): MarkerProcessor {
        return $this->createUsingParser(
            $this->parserFactory->create(),
            $title,
            $dataMap,
            $filter
        );
    }
}
