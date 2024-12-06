import { pgndbToMoves, pgndbNumChapters } from '$lib/pgnParsing.js';
import { orphanMoveSoftDeletionsQueries } from '$lib/movesUtil.js';

export async function importPgn(pgn_content, pgn_filename, prisma, user_id, repForWhite) {
    // Parse (multi-game) PGN into moves-list
    const moves = pgndbToMoves(pgn_content, repForWhite);
    const num_chapters_parsed = pgndbNumChapters(pgn_content);

    // Create PGN record
    const pgn = await prisma.pgn.create({
        data: {
            userId: user_id,
            repForWhite,
            filename: pgn_filename,
            content: pgn_content,
        },
    });

    // Prepare queries for inserting/upserting moves
    let queries = [];
    for (const move of moves) {
        move.userId = user_id;
        move.pgns = { connect: [{ id: pgn.id }] };

        queries.push(
            prisma.move.upsert({
                where: {
                    userId_repForWhite_fromFen_toFen: {
                        userId: user_id,
                        repForWhite: move.repForWhite,
                        fromFen: move.fromFen,
                        toFen: move.toFen,
                    },
                },
                create: {
                    userId: user_id,
                    repForWhite: move.repForWhite,
                    fromFen: move.fromFen,
                    toFen: move.toFen,
                    moveSan: move.moveSan,
                    ownMove: move.ownMove,
                    commentBefore: move.commentBefore || null,
                    commentMove: move.commentMove || null,
                    commentAfter: move.commentAfter || null,
                    nag: move.nag || null,
                    deleted: false,
                    pgns: { connect: [{ id: pgn.id }] },
                },
                update: {
                    pgns: { connect: [{ id: pgn.id }] },
                    deleted: false,
                    commentBefore: move.commentBefore || null,
                    commentMove: move.commentMove || null,
                    commentAfter: move.commentAfter || null,
                    nag: move.nag || null,
                },
            })
        );
    }

    // Execute queries in a transaction
    try {
        if (queries.length > 0) {
            await prisma.$transaction(queries);
        }
    } catch (e) {
        console.warn('Failed adding moves to database: ' + e.message);
        throw new Error('Failed adding moves to database: ' + e.message);
    }

    return {
        num_moves_parsed: moves.length,
        num_chapters_parsed,
    };
}

// Deletes a PGN.
// Soft-deletes all moves that are not in another PGN/Study.
// Returns the number of deleted moves.
export async function deletePgn( pgn_id, user_id, prisma ) {
	
	// get PGN and all moves
	const pgn = await prisma.Pgn.findUnique( {
		where: { id: pgn_id },
		include: {
			moves: {
				select: {
					id: true,
					pgns:    { select: {id:true} },
					studies: { select: {id:true} }
				}
			},
		}
	});
	if ( ! pgn )
		throw new Error( 'PGN #' + pgn_id + ' not found' );
	if ( pgn.userId != user_id )
		throw new Error( 'PGN does not belong to this account (are you logged in?)' );
	
	// Soft-delete moves
	let queries = orphanMoveSoftDeletionsQueries( pgn.moves, prisma );
	const num_deleted_moves = queries.length;

	// Delete the PGN
	queries.push( prisma.Pgn.delete({ where: { id: pgn.id } }) );

	// Run transaction
	try {
		await prisma.$transaction(queries);
	} catch(e) {
		console.log( 'Exception running PGN deletion transaction: ' + e.message );
		throw new Error( e.message );
	}

	return num_deleted_moves;
}


