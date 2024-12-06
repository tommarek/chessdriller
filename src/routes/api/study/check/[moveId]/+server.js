import { PrismaClient } from '@prisma/client';
import { error } from '@sveltejs/kit';

export async function GET({ locals, params }) {
    const { moveId } = params;

    // Validate session
    const session = await locals.auth.validate();
    if (!session) {
        return new Response(JSON.stringify({ success: false, message: 'not logged in' }), { status: 401 });
    }

    const userId = session.user.cdUserId;
    const prisma = new PrismaClient();

    try {
        // Check if the move has been studied
        const hasBeenStudied = await prisma.StudyHistory.findFirst({
            where: {
                userId,
                moveId: parseInt(moveId, 10),
            }
        });

        return new Response(
            JSON.stringify({ studied: !!hasBeenStudied }),
            { headers: { 'Content-Type': 'application/json' } }
        );
    } catch (err) {
        throw error(500, 'Internal Server Error');
    } finally {
        await prisma.$disconnect();
    }
}
