import { Chess } from '../../node_modules/cm-chess/src/Chess.js';

/*
 * PGN parsing (from connected Lichess study or uploaded PGN).
 * Glue to cm-chess.
 */

// Convert PGN database file (multiple concatenated PGNs) to a moves-list.
export function pgndbToMoves( pgndb, repForWhite ) {
	const pgntexts = split_pgndb_into_pgns( pgndb );
	return pgntexts.map( (pgn) => singlePgnToMoves( pgn, repForWhite ) ).flat();
}


// Converts text from single PGN game to a moves-list.
// Exported only as a test utility.
export function singlePgnToMoves( pgn_content, repForWhite ) {
	const chess = singlePgnToCMChess( pgn_content );
	return chessHistoryToMoves( chess.history(), repForWhite );
}

function singlePgnToCMChess( pgn_content ) {

	// remove comments due to issues parsing PGNs with two sequential comments
	// unit tests: "two comments after final move", "two comments before variant", "two comments before variant thrice"
	// TODO investigate whether this is a cm-pgn bug 
	pgn_content = pgn_content.replaceAll(/\{[^{}]*\}/g, '');

	// remove final '*', maybe cm-chess/chess.js bug makes it cause parser issues?
	pgn_content = pgn_content.replace(/\*\s*$/, '\n');

	const chess = new Chess();
	chess.loadPgn( pgn_content ); // TODO: handle unparsable PGNs
	return chess;
}

// Traverse all cm-chess moves, including variations, and returns moves-list
function chessHistoryToMoves( history, repForWhite ) {
	const moves = [];
	for ( const move of history ) {
		const ownMove = ( repForWhite && move.color == 'w' || !repForWhite && move.color == 'b' );
		moves.push( {
			repForWhite,
			ownMove,
			fromFen: normalize_fen( move.previous ? move.previous.fen : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' ),
			toFen:   normalize_fen(move.fen),
			moveSan: move.san,
		} );
		// traverse variations
		for ( const variation of move.variations ) {
			const variation_moves = chessHistoryToMoves( variation, repForWhite );
			moves.push( ...variation_moves );
		}
	}
	return moves;
}

// A PGN database file can contain multiple PGNs: http://www.saremba.de/chessgml/standards/pgn/pgn-complete.htm#c8
// Since chess.js and cm-chess don't support multiple PGNs, the file is split here. The spec points out that it is simple enough that a full-blown parser is not needed, but it remains to be seen whether kinda-complying PGNs in the wild will cause trouble. Ideally, this would be solved in cm-chess (or chess.js).
function split_pgndb_into_pgns( pgn_db ) {
	pgn_db = pgn_db.replaceAll( /\r/g, "" );
	const regex = /(\[.*?\n\n *\S.*?\n\n)/gs; // Should fail on PGNs with comments with empty lines
	const found = pgn_db.match(regex);
	return found;
}


// Guess whether PGN is for white or black.
// Returns w (white), b (black) or u (unknown)
export function guessColor( pgn_db ) {
	const pgntexts = split_pgndb_into_pgns( pgn_db );
	let moves_as_white, moves_as_black;
	try {
		moves_as_white = pgntexts.map( (pgn) => singlePgnToMoves( pgn, true  ) ).flat();
		moves_as_black = pgntexts.map( (pgn) => singlePgnToMoves( pgn, false ) ).flat();
	} catch (e) {
		console.log( 'warning: guessColor failed, returning unknown. ' + e.message );
		return 'u';
	}
	const num_splits_as_white = num_own_splits(moves_as_white);
	const num_splits_as_black = num_own_splits(moves_as_black);
	if ( num_splits_as_white > num_splits_as_black ) {
		return 'b';
	} else if ( num_splits_as_black > num_splits_as_white ) {
		return 'w';
	} else {
		return 'u';
	}
}
function num_own_splits(moves) {
	let num_moves_from_fen = {};
	for ( const move of moves.filter( (m) => m.ownMove ) ) {
		num_moves_from_fen[ move.fromFen ] = ( num_moves_from_fen[ move.fromFen ] ?? 0 ) + 1;
	}
	const splits = Object.values(num_moves_from_fen).filter( (num) => num > 1 );
	return splits.length;
}

// Generate the preview FEN from move n of the first chapter
export function makePreviewFen( pgn_db ) {
	const pgntexts = split_pgndb_into_pgns( pgn_db );
	const pgn_first_chapter = pgntexts[0];
	const initial_fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
	try {
		const chess = singlePgnToCMChess( pgn_first_chapter );
		if ( chess.pgn.history.moves == 0 )
			return initial_fen;
		const preview_move_i = Math.min( 4, chess.pgn.history.moves.length ) - 1;
		return chess.pgn.history.moves[ preview_move_i ].fen;
	} catch (e) {
		console.log( 'warning: makePreviewFen failed, returning origin position. ' + e.message );
		return initial_fen;
	}
}


// Canonicalise FEN by removing last three elements: en passant square, half-move clock and fullmove number. see README
function normalize_fen( fen ) {
	return fen.replace(/ (-|[a-h][1-8]) \d+ \d+$/, '' );
}