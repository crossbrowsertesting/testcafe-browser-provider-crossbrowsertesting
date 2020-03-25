import { Selector } from 'testcafe';
fixture `Getting Started`
    .page `http://devexpress.github.io/testcafe/example`;
test('My first test', async t => {
    await t
        .typeText('#developer-name', 'John Smith')
        .click('#submit-button')
        .wait(10000)
        // Use the assertion to check if the actual header text is equal to the expected one
        .expect(Selector('#article-header').innerText).eql('Thank you, John Smith!');
});

test('My second test', async t => {
    await t
        .typeText('#developer-name', 'John Smith')
        .click('#submit-button')
        .wait(10000)
        // Use the assertion to check if the actual header text is equal to the expected one
        .expect(Selector('#article-header').innerText).eql('Thank you, John Smith!');
});

test('My third test', async t => {
    await t
        .typeText('#developer-name', 'John Smith')
        .click('#submit-button')
        .wait(10000)
        // Use the assertion to check if the actual header text is equal to the expected one
        .expect(Selector('#article-header').innerText).eql('Thank you, John Smith!');
});
