const { PrismaClient } = require('../../generated/prisma');
const prisma = new PrismaClient();

async function seedManagers() {
    try {
        console.log('Starting to seed manager users...');

        // Define manager users to create
        const managers = [
            {
                userId: 'MGR001',
                username: 'john.smith',
                password: 'manager123',
                email: 'john.smith@company.com',
                firstName: 'John',
                lastName: 'Smith',
                role: 'MANAGER',
                department: 'Finance',
                isActive: true
            },
            {
                userId: 'MGR002',
                username: 'sarah.johnson',
                password: 'manager123',
                email: 'sarah.johnson@company.com',
                firstName: 'Sarah',
                lastName: 'Johnson',
                role: 'MANAGER',
                department: 'Operations',
                isActive: true
            },
            {
                userId: 'MGR003',
                username: 'michael.chen',
                password: 'manager123',
                email: 'michael.chen@company.com',
                firstName: 'Michael',
                lastName: 'Chen',
                role: 'MANAGER',
                department: 'Engineering',
                isActive: true
            },
            {
                userId: 'MGR004',
                username: 'emma.williams',
                password: 'manager123',
                email: 'emma.williams@company.com',
                firstName: 'Emma',
                lastName: 'Williams',
                role: 'MANAGER',
                department: 'Regional Manager',
                isActive: true
            },
            {
                userId: 'MGR005',
                username: 'david.brown',
                password: 'manager123',
                email: 'david.brown@company.com',
                firstName: 'David',
                lastName: 'Brown',
                role: 'MANAGER',
                department: 'IT',
                isActive: true
            },
            {
                userId: 'USR001',
                username: 'alice.cooper',
                password: 'user123',
                email: 'alice.cooper@company.com',
                firstName: 'Alice',
                lastName: 'Cooper',
                role: 'USER',
                department: 'Sales',
                isActive: true
            },
            {
                userId: 'USR002',
                username: 'bob.martin',
                password: 'user123',
                email: 'bob.martin@company.com',
                firstName: 'Bob',
                lastName: 'Martin',
                role: 'USER',
                department: 'Marketing',
                isActive: true
            }
        ];

        let created = 0;
        let skipped = 0;

        for (const manager of managers) {
            try {
                // Check if user already exists
                const existing = await prisma.user.findFirst({
                    where: {
                        OR: [
                            { userId: manager.userId },
                            { username: manager.username },
                            { email: manager.email }
                        ]
                    }
                });

                if (existing) {
                    console.log(`Skipping ${manager.username} - already exists`);
                    skipped++;
                    continue;
                }

                await prisma.user.create({
                    data: manager
                });

                console.log(`Created ${manager.role}: ${manager.firstName} ${manager.lastName} (${manager.username})`);
                created++;
            } catch (error) {
                console.error(`Error creating user ${manager.username}:`, error.message);
            }
        }

        console.log(`\nSeeding complete!`);
        console.log(`Created: ${created} users`);
        console.log(`Skipped: ${skipped} users (already exist)`);

        // Display all managers
        const allManagers = await prisma.user.findMany({
            where: { role: 'MANAGER' },
            select: {
                userId: true,
                username: true,
                firstName: true,
                lastName: true,
                department: true,
                email: true
            }
        });

        console.log(`\nTotal managers in database: ${allManagers.length}`);
        console.log('Managers:');
        allManagers.forEach(mgr => {
            console.log(`  - ${mgr.firstName} ${mgr.lastName} (${mgr.username}) - ${mgr.department}`);
        });

    } catch (error) {
        console.error('Error seeding managers:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Run the seed function
seedManagers()
    .then(() => {
        console.log('\nDone!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Failed to seed:', error);
        process.exit(1);
    });

